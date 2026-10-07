// Anonymous identities end to end over HTTP with a real database: cookie, profile, terms, ownership, recovery code,
// and the guards in front of every write.
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { env } from '../../src/config/env.js'
import { pool } from '../../src/db/pool.js'
import { authRepository } from '../../src/modules/auth/auth.repository.js'
import { pngImage } from '../fixtures/images.js'
import { meOf, ORIGIN, signIn } from './auth.js'
import { resetDb, seedPlaces, type Seeded } from './db.js'

const app = createApp()
let seeded: Seeded

beforeEach(async () => {
  await resetDb()
  seeded = await seedPlaces()
})

const NEW_SPOT = { name: 'Canal Saint-Martin', photo_category: 'bridge', lng: 2.3655, lat: 48.8712 }

describe('anonymous identity', () => {
  it('first sign-in sets an HttpOnly, SameSite=Lax session cookie and a generated name in the UI language', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/anonymous')
      .set('Origin', ORIGIN)
      .set('x-ui-lang', 'fr')
      .send({})
      .expect(200)
    const cookie = res.headers['set-cookie']?.[0] ?? ''
    expect(cookie).toMatch(/session_token=/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    // About a year, renewed while used: anonymous participants must not lose their identity after a week.
    expect(Number(/Max-Age=(\d+)/.exec(cookie)?.[1])).toBe(env.SESSION_EXPIRES_DAYS * 24 * 3600)
    expect(res.body.user.name).toMatch(/^Voyageur \d{4}$/)
  })

  it('the same browser stays the same person; /me reports name, anonymity and terms', async () => {
    const agent = await signIn(app, { acceptTerms: false })
    const first = await meOf(agent)
    expect(first).toMatchObject({
      is_anonymous: true,
      role: 'participant',
      terms_accepted: false,
      has_recovery_code: false,
    })
    expect((await meOf(agent)).id).toBe(first.id)
  })

  it('a visitor without a session gets user: null, never cached', async () => {
    const res = await request(app).get('/api/v1/me').expect(200)
    expect(res.body).toEqual({ user: null, terms_version: env.TERMS_VERSION })
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('signing out ends the session', async () => {
    const agent = await signIn(app)
    await agent.post('/api/auth/sign-out').set('Origin', ORIGIN).send({}).expect(200)
    expect((await agent.get('/api/v1/me').expect(200)).body.user).toBeNull()
  })

  it("Better Auth's own profile and deletion endpoints are switched off (names are validated by /me/update)", async () => {
    const agent = await signIn(app)
    for (const path of ['/api/auth/update-user', '/api/auth/delete-user', '/api/auth/delete-anonymous-user']) {
      await agent.post(path).set('Origin', ORIGIN).send({ name: 'Admin' }).expect(404)
    }
  })
})

describe('guards in front of writes', () => {
  it('401 UNAUTHENTICATED without a session (spots and photos)', async () => {
    const spot = await request(app).post('/api/v1/spots').send(NEW_SPOT).expect(401)
    expect(spot.body.error.code).toBe('UNAUTHENTICATED')
    const photo = await request(app)
      .post('/api/v1/photos')
      .field('spot_id', seeded.spot.eiffel)
      .attach('file', await pngImage(), { filename: 'a.png', contentType: 'image/png' })
      .expect(401)
    expect(photo.body.error.code).toBe('UNAUTHENTICATED')
    expect((await pool.query('SELECT count(*)::int AS n FROM photos')).rows[0].n).toBe(0)
  })

  it('403 TERMS_REQUIRED until the current terms are accepted; an old version is refused with 409', async () => {
    const agent = await signIn(app, { acceptTerms: false })
    expect((await agent.post('/api/v1/spots').send(NEW_SPOT).expect(403)).body.error.code).toBe('TERMS_REQUIRED')
    const old = await agent.post('/api/v1/me/terms').send({ version: 'draft-0' }).expect(409)
    expect(old.body.error.code).toBe('TERMS_OUTDATED')
    await agent.post('/api/v1/me/terms').send({ version: env.TERMS_VERSION }).expect(200)
    await agent.post('/api/v1/spots').send(NEW_SPOT).expect(201)
  })

  it('403 POSTING_SUSPENDED while suspended, with the end date', async () => {
    const agent = await signIn(app)
    const until = new Date(Date.now() + 3 * 24 * 3600 * 1000)
    await pool.query('UPDATE users SET posting_suspended_until = $2 WHERE id = $1', [(await meOf(agent)).id, until])
    const res = await agent.post('/api/v1/spots').send(NEW_SPOT).expect(403)
    expect(res.body.error).toMatchObject({ code: 'POSTING_SUSPENDED', details: [{ until: until.toISOString() }] })
  })

  it('403 FORBIDDEN_ORIGIN for a write sent from another site (CSRF)', async () => {
    const agent = await signIn(app)
    const res = await agent.post('/api/v1/spots').set('Origin', 'https://evil.example').send(NEW_SPOT).expect(403)
    expect(res.body.error.code).toBe('FORBIDDEN_ORIGIN')
    expect((await pool.query("SELECT count(*)::int AS n FROM pois WHERE source = 'user'")).rows[0].n).toBe(0)
  })
})

describe('ownership and names', () => {
  it('spots and photos record their author; photos show the author current name', async () => {
    const agent = await signIn(app)
    const me = await meOf(agent)
    const spot = (await agent.post('/api/v1/spots').send(NEW_SPOT).expect(201)).body
    const photo = (
      await agent
        .post('/api/v1/photos')
        .field('spot_id', spot.id)
        .attach('file', await pngImage(), { filename: 'a.png', contentType: 'image/png' })
        .expect(201)
    ).body
    const owners = await pool.query(
      `SELECT (SELECT created_by FROM pois WHERE id = $1) AS spot_owner, (SELECT user_id FROM photos WHERE id = $2) AS photo_owner`,
      [spot.id, photo.id],
    )
    expect(owners.rows[0]).toEqual({ spot_owner: me.id, photo_owner: me.id })
    expect(photo.author_name).toBe(me.name)

    await agent.post('/api/v1/me/update').send({ name: '  Linh   Nguyễn ' }).expect(200)
    // Still waiting for review: the author sees it.
    const list = await agent.post('/api/v1/photos/list').send({ spot_id: spot.id }).expect(200)
    expect(list.body.items[0].author_name).toBe('Linh Nguyễn')
  })

  it('photos posted before accounts keep the name typed then', async () => {
    await pool.query(
      `INSERT INTO photos (poi_id, file_name, thumb_name, width, height, author_name) VALUES ($1, 'a.jpg', 'a_t.jpg', 10, 10, 'Minh')`,
      [seeded.spot.eiffel],
    )
    const list = await request(app).post('/api/v1/photos/list').send({ spot_id: seeded.spot.eiffel }).expect(200)
    expect(list.body.items[0].author_name).toBe('Minh')
  })

  it('a name passing for staff or the app is refused', async () => {
    const agent = await signIn(app)
    const res = await agent.post('/api/v1/me/update').send({ name: 'Quản trị viên' }).expect(400)
    expect(res.body.error.code).toBe('INVALID_NAME')
  })
})

describe('recovery code', () => {
  it('brings the same identity to another browser; a new code replaces the old one', async () => {
    const phone = await signIn(app)
    const me = await meOf(phone)
    const { code } = (await phone.post('/api/auth/recovery-code/create').set('Origin', ORIGIN).send({}).expect(200))
      .body
    expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/)
    expect((await meOf(phone)).has_recovery_code).toBe(true)

    const laptop = request.agent(app)
    await laptop
      .post('/api/auth/recovery-code/sign-in')
      .set('Origin', ORIGIN)
      .send({ code: code.toLowerCase().replace(/-/g, ' ') })
      .expect(200)
    expect((await meOf(laptop)).id).toBe(me.id)

    const { code: newer } = (
      await phone.post('/api/auth/recovery-code/create').set('Origin', ORIGIN).send({}).expect(200)
    ).body
    expect(newer).not.toBe(code)
    await request(app).post('/api/auth/recovery-code/sign-in').set('Origin', ORIGIN).send({ code }).expect(401)
  })

  it('creating a code needs a session; a wrong code is refused', async () => {
    await request(app).post('/api/auth/recovery-code/create').set('Origin', ORIGIN).send({}).expect(401)
    await request(app)
      .post('/api/auth/recovery-code/sign-in')
      .set('Origin', ORIGIN)
      .send({ code: 'AAAA-BBBB-CCCC-DDDD' })
      .expect(401)
  })

  it('the code is stored only as a hash', async () => {
    const agent = await signIn(app)
    const { code } = (await agent.post('/api/auth/recovery-code/create').set('Origin', ORIGIN).send({}).expect(200))
      .body
    const { rows } = await pool.query('SELECT recovery_code_hash FROM users WHERE id = $1', [(await meOf(agent)).id])
    expect(rows[0].recovery_code_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(rows)).not.toContain(code.replace(/-/g, ''))
  })
})

describe('linking an anonymous identity into an account', () => {
  it('moves spots, photos and accepted terms in one go', async () => {
    const anon = await signIn(app)
    const account = await signIn(app, { acceptTerms: false })
    const [from, to] = [(await meOf(anon)).id, (await meOf(account)).id]
    const spot = (await anon.post('/api/v1/spots').send(NEW_SPOT).expect(201)).body
    await anon
      .post('/api/v1/photos')
      .field('spot_id', seeded.spot.eiffel)
      .attach('file', await pngImage(), { filename: 'a.png', contentType: 'image/png' })
      .expect(201)

    await authRepository.transferOwnership(from, to)

    const { rows } = await pool.query(
      `SELECT (SELECT count(*)::int FROM pois WHERE created_by = $1) AS spots_left,
              (SELECT count(*)::int FROM photos WHERE user_id = $1) AS photos_left,
              (SELECT created_by FROM pois WHERE id = $3) AS spot_owner,
              (SELECT count(*)::int FROM photos WHERE user_id = $2) AS photos_moved`,
      [from, to, spot.id],
    )
    expect(rows[0]).toEqual({ spots_left: 0, photos_left: 0, spot_owner: to, photos_moved: 1 })
    expect((await meOf(account)).terms_accepted).toBe(true)
  })
})
