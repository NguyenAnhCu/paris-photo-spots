// The write limiter with a tiny limit. env.ts reads WRITE_RATE_LIMIT on import, so everything from src/ is imported
// after setting it (the other integration files run with a limit high enough never to trigger).
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

process.env.WRITE_RATE_LIMIT = '3'
const { createApp } = await import('../../src/app.js')
const { resetDb, seedPlaces } = await import('./db.js')
const { signIn } = await import('./auth.js')

const app = createApp()
let spotId = ''
let author: Awaited<ReturnType<typeof signIn>>

beforeAll(async () => {
  await resetDb()
  spotId = (await seedPlaces()).spot.eiffel
  author = await signIn(app)
})

// Per IP, on top of the per-person daily quota (quota.test.ts): one person can hold many anonymous identities.
describe('write rate limit per IP', () => {
  it('answers 429 RATE_LIMITED after WRITE_RATE_LIMIT writes from one IP, across spots and photos', async () => {
    const spot = { name: 'Spot', photo_category: 'street', lng: 2.3012, lat: 48.8738 }
    // Rejected writes count too: probing with invalid data must not be free.
    await author.post('/api/v1/spots').send(spot).expect(201)
    await author.post('/api/v1/spots').send(spot).expect(409)
    const third = await author.post('/api/v1/spots').send({ name: 'x' }).expect(400)
    expect(third.headers.ratelimit).toMatch(/r=0/) // draft-8 header: remaining 0

    const blocked = await author.post('/api/v1/spots').send(spot).expect(429)
    expect(blocked.body.error.code).toBe('RATE_LIMITED')
    const photo = await author.post('/api/v1/photos').field('spot_id', spotId).expect(429)
    expect(photo.body.error.code).toBe('RATE_LIMITED')
  })

  it('never limits reads', async () => {
    for (let i = 0; i < 5; i++) await request(app).get('/api/v1/spots').expect(200)
    await request(app).post('/api/v1/photos/list').send({ spot_id: spotId }).expect(200)
  })
})
