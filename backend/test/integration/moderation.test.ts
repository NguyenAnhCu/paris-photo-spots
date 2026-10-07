// Moderation over HTTP with a real database: who sees what, the review queue, decisions and their history, trust
// levels, suspensions and reports.
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { env } from '../../src/config/env.js'
import { pool } from '../../src/db/pool.js'
import { jpegWithGps, pngImage } from '../fixtures/images.js'
import { SPOTS } from '../fixtures/places.js'
import { meOf, setRole, signIn, type Agent } from './auth.js'
import { resetDb, seedPlaces, type Seeded } from './db.js'

const app = createApp()
let seeded: Seeded
let author: Agent
let reviewer: Agent

beforeEach(async () => {
  await resetDb()
  seeded = await seedPlaces()
  author = await signIn(app) // anonymous: posts wait for review
  reviewer = await signIn(app)
  await setRole(reviewer, 'reviewer')
})

const CANAL = { name: 'Canal Saint-Martin', photo_category: 'bridge', lng: 2.3655, lat: 48.8712 }

async function postSpot(agent: Agent, spot = CANAL) {
  return (await agent.post('/api/v1/spots').send(spot).expect(201)).body as { id: string; status: string }
}
async function postPhoto(agent: Agent, spotId: string, file?: Buffer) {
  return (
    await agent
      .post('/api/v1/photos')
      .field('spot_id', spotId)
      .attach('file', file ?? (await pngImage()), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(201)
  ).body as { id: string; status: string }
}
const decide = (agent: Agent, body: Record<string, unknown>) => agent.post('/api/v1/moderation/decide').send(body)
const publicIds = async () =>
  ((await request(app).get('/api/v1/spots').expect(200)).body.features as { properties: { id: string } }[]).map(
    (f) => f.properties.id,
  )

describe('pending content is private to its author and reviewers', () => {
  it('an anonymous post waits; the public, other participants and the map layers do not see it', async () => {
    const spot = await postSpot(author)
    expect(spot.status).toBe('pending')

    expect(await publicIds()).not.toContain(spot.id)
    await request(app).get(`/api/v1/spots/item?id=${spot.id}`).expect(404)
    const other = await signIn(app)
    await other.get(`/api/v1/spots/item?id=${spot.id}`).expect(404)
    const nearby = await request(app)
      .get(`/api/v1/pois/nearby?lng=${CANAL.lng}&lat=${CANAL.lat}&radius=200`)
      .expect(200)
    expect(JSON.stringify(nearby.body)).not.toContain(spot.id)

    expect((await author.get(`/api/v1/spots/item?id=${spot.id}`).expect(200)).body.status).toBe('pending')
    expect((await reviewer.get(`/api/v1/spots/item?id=${spot.id}`).expect(200)).body.status).toBe('pending')
  })

  it('a pending photo is listed for its uploader and reviewers only, and is not counted publicly', async () => {
    const photo = await postPhoto(author, seeded.spot.eiffel)
    expect(photo.status).toBe('pending')
    const body = { spot_id: seeded.spot.eiffel }
    expect((await request(app).post('/api/v1/photos/list').send(body).expect(200)).body.items).toEqual([])
    const own = (await author.post('/api/v1/photos/list').send(body).expect(200)).body
    expect(own.items.map((p: { id: string }) => p.id)).toEqual([photo.id])
    expect((await reviewer.post('/api/v1/photos/list').send(body).expect(200)).body.total).toBe(1)
    const item = await request(app).get(`/api/v1/spots/item?id=${seeded.spot.eiffel}`).expect(200)
    expect(item.body.photo_count).toBe(0)
  })

  it('only the author (or a reviewer) can add photos to a pending spot', async () => {
    const spot = await postSpot(author)
    await postPhoto(author, spot.id)
    const other = await signIn(app)
    await other
      .post('/api/v1/photos')
      .field('spot_id', spot.id)
      .attach('file', await pngImage(), { filename: 'a.png', contentType: 'image/png' })
      .expect(404)
  })

  it("someone else's pending spot neither blocks nor leaks through the duplicate check", async () => {
    await postSpot(author)
    const other = await signIn(app)
    await other
      .post('/api/v1/spots')
      .send({ ...CANAL, name: 'Canal du coin' })
      .expect(201)
  })

  it('the author lists their own posts with status; /me counts decisions not yet seen', async () => {
    const spot = await postSpot(author)
    await decide(reviewer, {
      target_type: 'spot',
      target_id: spot.id,
      action: 'reject',
      reason_code: 'duplicate',
    }).expect(200)

    const mine = (await author.get('/api/v1/me/submissions').expect(200)).body
    expect(mine.spots).toEqual([
      expect.objectContaining({
        id: spot.id,
        status: 'rejected',
        decision: expect.objectContaining({ action: 'reject', reason_code: 'duplicate' }),
      }),
    ])
    expect((await meOf(author)).unread_decisions).toBe(1)
    await author.post('/api/v1/me/notifications/seen').send({}).expect(200)
    expect((await meOf(author)).unread_decisions).toBe(0)
  })
})

describe('review queue', () => {
  it('lists pending photos oldest first with the author, the GPS distance band and duplicates', async () => {
    const original = await jpegWithGps() // GPS of the Eiffel Tower
    const first = await postPhoto(author, seeded.spot.eiffel, original)
    const again = await postPhoto(author, seeded.spot.eiffel, original)
    const elsewhere = await postPhoto(author, seeded.spot.cremieux, original) // 6 km away

    const queue = (await reviewer.post('/api/v1/moderation/queue/list').send({ kind: 'photo' }).expect(200)).body
    expect(queue.items.map((i: { id: string }) => i.id)).toEqual([first.id, again.id, elsewhere.id])
    expect(queue.items[0]).toMatchObject({
      spot_name: 'Tour Eiffel',
      gps_distance: 'lt200m',
      author: expect.objectContaining({ is_anonymous: true, approved: 0, rejected: 0 }),
      thumb_url: expect.stringMatching(/^\/media\/photos\//),
    })
    expect(queue.items[1].duplicate_of).toBe(first.id)
    expect(queue.items[2]).toMatchObject({ gps_distance: 'far', duplicate_of: null })
    // Never the stored file names or the hash itself.
    expect(queue.items[0]).not.toHaveProperty('file_name')
    expect(queue.items[0]).not.toHaveProperty('phash')
  })

  it('lists pending spots with the closest public spot when it is within 100 m', async () => {
    const [lng, lat] = SPOTS.find((s) => s.key === 'eiffel')?.at ?? [0, 0]
    await author
      .post('/api/v1/spots')
      .send({ name: 'Tháp sắt', photo_category: 'landmark', lng: lng + 0.0006, lat })
      .expect(201)
    const queue = (await reviewer.post('/api/v1/moderation/queue/list').send({ kind: 'spot' }).expect(200)).body
    expect(queue.items[0]).toMatchObject({ name: 'Tháp sắt', near_name: 'Tour Eiffel' })
    expect(queue.items[0].near_m).toBeLessThan(100)
  })

  it('participants get 403, visitors 401, on every moderation endpoint', async () => {
    for (const path of ['/queue/list', '/decide', '/spot/update', '/suspend', '/report/resolve']) {
      await author.post(`/api/v1/moderation${path}`).send({}).expect(403)
      await request(app).post(`/api/v1/moderation${path}`).send({}).expect(401)
    }
  })
})

describe('decisions', () => {
  it('approve makes it public and records who did it', async () => {
    const spot = await postSpot(author)
    const res = await decide(reviewer, { target_type: 'spot', target_id: spot.id, action: 'approve' }).expect(200)
    expect(res.body.status).toBe('approved')
    expect(await publicIds()).toContain(spot.id)
    const { rows } = await pool.query(
      `SELECT ma.action, ma.actor_id, p.reviewed_by
       FROM moderation_actions ma JOIN pois p ON p.id = ma.target_id WHERE ma.target_id = $1`,
      [spot.id],
    )
    const reviewerId = (await meOf(reviewer)).id
    expect(rows).toEqual([{ action: 'approve', actor_id: reviewerId, reviewed_by: reviewerId }])
  })

  it('reject and hide need a reason (400 REASON_REQUIRED)', async () => {
    const spot = await postSpot(author)
    const res = await decide(reviewer, { target_type: 'spot', target_id: spot.id, action: 'reject' }).expect(400)
    expect(res.body.error.code).toBe('REASON_REQUIRED')
  })

  it('a second decision on the same item gets 409 INVALID_TRANSITION (two reviewers at once)', async () => {
    const photo = await postPhoto(author, seeded.spot.eiffel)
    const other = await signIn(app)
    await setRole(other, 'reviewer')
    const [a, b] = await Promise.all([
      decide(reviewer, { target_type: 'photo', target_id: photo.id, action: 'approve' }),
      decide(other, { target_type: 'photo', target_id: photo.id, action: 'reject', reason_code: 'spam' }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM moderation_actions WHERE target_id = $1', [
      photo.id,
    ])
    expect(rows[0].n).toBe(1)
  })

  it('hide takes public content down and settles its open reports; restore brings it back', async () => {
    const spot = await postSpot(author)
    await decide(reviewer, { target_type: 'spot', target_id: spot.id, action: 'approve' }).expect(200)
    const reporter = await signIn(app)
    await reporter
      .post('/api/v1/reports')
      .send({ target_type: 'spot', target_id: spot.id, reason_code: 'spam' })
      .expect(201)

    await decide(reviewer, { target_type: 'spot', target_id: spot.id, action: 'hide', reason_code: 'spam' }).expect(200)
    expect(await publicIds()).not.toContain(spot.id)
    const reports = await pool.query('SELECT status FROM reports WHERE target_id = $1', [spot.id])
    expect(reports.rows).toEqual([{ status: 'resolved' }])

    await decide(reviewer, { target_type: 'spot', target_id: spot.id, action: 'restore' }).expect(200)
    expect(await publicIds()).toContain(spot.id)
  })

  it('unknown targets answer 404', async () => {
    await decide(reviewer, {
      target_type: 'photo',
      target_id: '00000000-0000-4000-8000-000000000000',
      action: 'approve',
    }).expect(404)
  })

  it('a reviewer can fix a spot name, category and tip; the change is logged', async () => {
    const spot = await postSpot(author)
    await reviewer
      .post('/api/v1/moderation/spot/update')
      .send({ id: spot.id, name: 'Canal Saint-Martin (écluses)', photo_category: 'street', tip: null })
      .expect(200)
    const item = (await reviewer.get(`/api/v1/spots/item?id=${spot.id}`).expect(200)).body
    expect(item).toMatchObject({ name: 'Canal Saint-Martin (écluses)', photo_category: 'street', tip: null })
    const { rows } = await pool.query("SELECT 1 FROM moderation_actions WHERE target_id = $1 AND action = 'edit'", [
      spot.id,
    ])
    expect(rows).toHaveLength(1)
  })
})

describe('trust levels', () => {
  async function linkedWithApproved(n: number) {
    const agent = await signIn(app)
    await pool.query('UPDATE users SET is_anonymous = false WHERE id = $1', [(await meOf(agent)).id])
    for (let i = 0; i < n; i++) {
      const photo = await postPhoto(agent, seeded.spot.eiffel)
      await decide(reviewer, { target_type: 'photo', target_id: photo.id, action: 'approve' }).expect(200)
    }
    return agent
  }

  it(`a linked account with ${env.TRUST_MIN_APPROVED} approved posts publishes at once`, async () => {
    const almost = await linkedWithApproved(env.TRUST_MIN_APPROVED - 1)
    expect((await postPhoto(almost, seeded.spot.luxembourg)).status).toBe('pending')
    const trusted = await linkedWithApproved(env.TRUST_MIN_APPROVED)
    expect((await postPhoto(trusted, seeded.spot.luxembourg)).status).toBe('approved')
  })

  it('a recent rejection removes the trust (hiding public content does not)', async () => {
    const trusted = await linkedWithApproved(env.TRUST_MIN_APPROVED)
    const bad = await postPhoto(trusted, seeded.spot.luxembourg)
    expect(bad.status).toBe('approved')
    await decide(reviewer, { target_type: 'photo', target_id: bad.id, action: 'hide', reason_code: 'spam' }).expect(200)
    expect((await postPhoto(trusted, seeded.spot.luxembourg)).status).toBe('approved')

    const next = await linkedWithApproved(env.TRUST_MIN_APPROVED)
    await pool.query('UPDATE users SET is_anonymous = true WHERE id = $1', [(await meOf(next)).id])
    const pending = await postPhoto(next, seeded.spot.luxembourg)
    await pool.query('UPDATE users SET is_anonymous = false WHERE id = $1', [(await meOf(next)).id])
    await decide(reviewer, {
      target_type: 'photo',
      target_id: pending.id,
      action: 'reject',
      reason_code: 'low_quality',
    }).expect(200)
    expect((await postPhoto(next, seeded.spot.luxembourg)).status).toBe('pending')
  })
})

describe('suspensions', () => {
  it(`at most ${env.REVIEWER_SUSPEND_MAX_DAYS} days; the participant can no longer post`, async () => {
    const userId = (await meOf(author)).id
    const tooLong = await reviewer
      .post('/api/v1/moderation/suspend')
      .send({ user_id: userId, days: env.REVIEWER_SUSPEND_MAX_DAYS + 1, reason_code: 'spam' })
      .expect(400)
    expect(tooLong.body.error.code).toBe('SUSPENSION_TOO_LONG')
    await reviewer
      .post('/api/v1/moderation/suspend')
      .send({ user_id: userId, days: 3, reason_code: 'spam' })
      .expect(200)
    expect((await author.post('/api/v1/spots').send(CANAL).expect(403)).body.error.code).toBe('POSTING_SUSPENDED')
  })

  it('staff cannot be suspended this way', async () => {
    const other = await signIn(app)
    await setRole(other, 'reviewer')
    await reviewer
      .post('/api/v1/moderation/suspend')
      .send({ user_id: (await meOf(other)).id, days: 1, reason_code: 'spam' })
      .expect(403)
  })
})

describe('reports', () => {
  it('a participant reports a public photo once; reviewers see it; pending content cannot be reported', async () => {
    const publicPhoto = await postPhoto(reviewer, seeded.spot.eiffel) // staff post: public at once
    const reporter = await signIn(app)
    const body = {
      target_type: 'photo',
      target_id: publicPhoto.id,
      reason_code: 'people_identifiable',
      message: 'Tôi trong ảnh',
    }
    await reporter.post('/api/v1/reports').send(body).expect(201)
    await reporter.post('/api/v1/reports').send(body).expect(201) // again: no duplicate

    const queue = (await reviewer.post('/api/v1/moderation/queue/list').send({ kind: 'report' }).expect(200)).body
    expect(queue.items).toEqual([
      expect.objectContaining({
        target_id: publicPhoto.id,
        reason_code: 'people_identifiable',
        target_name: 'Tour Eiffel',
      }),
    ])
    await reviewer
      .post('/api/v1/moderation/report/resolve')
      .send({ id: queue.items[0].id, outcome: 'dismissed' })
      .expect(200)
    expect((await reviewer.post('/api/v1/moderation/queue/list').send({ kind: 'report' })).body.items).toEqual([])

    const pending = await postPhoto(author, seeded.spot.eiffel)
    await reporter
      .post('/api/v1/reports')
      .send({ ...body, target_id: pending.id })
      .expect(404)
    await request(app).post('/api/v1/reports').send(body).expect(401)
  })
})
