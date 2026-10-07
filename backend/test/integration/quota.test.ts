// Daily quotas per person with small limits. env.ts reads them on import, so src/ is imported after setting them
// (other files run with limits too high to trigger).
import { beforeEach, describe, expect, it } from 'vitest'

process.env.QUOTA_ANON_SPOTS_PER_DAY = '2'
process.env.QUOTA_ANON_PHOTOS_PER_DAY = '1'
process.env.QUOTA_LINKED_MULTIPLIER = '2'
const { createApp } = await import('../../src/app.js')
const { pool } = await import('../../src/db/pool.js')
const { resetDb, seedPlaces } = await import('./db.js')
const { meOf, setRole, signIn } = await import('./auth.js')
const { pngImage } = await import('../fixtures/images.js')

const app = createApp()
let eiffel = ''

beforeEach(async () => {
  await resetDb()
  eiffel = (await seedPlaces()).spot.eiffel
})

// Spread apart so the duplicate check (30 m) never answers first.
const spotAt = (i: number) => ({ name: `Spot ${i}`, photo_category: 'street', lng: 2.3 + i * 0.01, lat: 48.87 })

describe('daily quota per person', () => {
  it('anonymous: the (limit + 1)th spot in 24 h gets 429 QUOTA_EXCEEDED; photos are counted separately', async () => {
    const agent = await signIn(app)
    await agent.post('/api/v1/spots').send(spotAt(1)).expect(201)
    await agent.post('/api/v1/spots').send(spotAt(2)).expect(201)
    const res = await agent.post('/api/v1/spots').send(spotAt(3)).expect(429)
    expect(res.body.error).toMatchObject({ code: 'QUOTA_EXCEEDED', details: [{ limit: 2 }] })

    const png = await pngImage()
    const photo = () =>
      agent
        .post('/api/v1/photos')
        .field('spot_id', eiffel)
        .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
    await photo().expect(201)
    expect((await photo().expect(429)).body.error.code).toBe('QUOTA_EXCEEDED')
  })

  it('posts older than 24 h no longer count', async () => {
    const agent = await signIn(app)
    await agent.post('/api/v1/spots').send(spotAt(1)).expect(201)
    await agent.post('/api/v1/spots').send(spotAt(2)).expect(201)
    await pool.query("UPDATE pois SET created_at = NOW() - interval '25 hours' WHERE created_by = $1", [
      (await meOf(agent)).id,
    ])
    await agent.post('/api/v1/spots').send(spotAt(3)).expect(201)
  })

  it('a linked account gets the multiplier; reviewers have no quota', async () => {
    const linked = await signIn(app)
    await pool.query('UPDATE users SET is_anonymous = false WHERE id = $1', [(await meOf(linked)).id])
    for (let i = 1; i <= 4; i++) await linked.post('/api/v1/spots').send(spotAt(i)).expect(201)
    await linked.post('/api/v1/spots').send(spotAt(5)).expect(429)

    const reviewer = await signIn(app)
    await setRole(reviewer, 'reviewer')
    for (let i = 10; i <= 16; i++) await reviewer.post('/api/v1/spots').send(spotAt(i)).expect(201)
  })
})
