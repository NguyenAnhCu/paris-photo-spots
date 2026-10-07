// Anonymous sign-in and recovery-code attempts per IP, with a tiny limit (env.ts reads it on import).
import request from 'supertest'
import { describe, expect, it } from 'vitest'

process.env.AUTH_RATE_LIMIT_PER_MINUTE = '2'
const { createApp } = await import('../../src/app.js')
const { env } = await import('../../src/config/env.js')

const app = createApp()
const ORIGIN = env.PUBLIC_ORIGIN

describe('auth rate limit per IP', () => {
  it('the (limit + 1)th new identity from one address gets 429 RATE_LIMITED', async () => {
    await request(app).post('/api/auth/sign-in/anonymous').set('Origin', ORIGIN).send({}).expect(200)
    await request(app).post('/api/auth/sign-in/anonymous').set('Origin', ORIGIN).send({}).expect(200)
    const res = await request(app).post('/api/auth/sign-in/anonymous').set('Origin', ORIGIN).send({}).expect(429)
    expect(res.body.error.code).toBe('RATE_LIMITED')
    // Recovery-code guesses count against the same budget: no switching to guessing once sign-ins are blocked.
    const guess = await request(app)
      .post('/api/auth/recovery-code/sign-in')
      .set('Origin', ORIGIN)
      .send({ code: 'AAAA-BBBB-CCCC-DDDD' })
      .expect(429)
    expect(guess.body.error.code).toBe('RATE_LIMITED')
  })

  it('reading the session is never limited', async () => {
    for (let i = 0; i < 5; i++) await request(app).get('/api/auth/get-session').expect(200)
  })
})
