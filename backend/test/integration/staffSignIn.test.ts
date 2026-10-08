// Staff (reviewers, admins) sign in with a username and a password. Accounts come from the staff command-line tool
// only: no sign-up, no password reset by email, no way to probe which usernames exist.
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createStaff } from '../../db/admin/staff.js'
import { createApp } from '../../src/app.js'
import { env } from '../../src/config/env.js'
import { pool } from '../../src/db/pool.js'
import { meOf, signIn } from './auth.js'
import { resetDb } from './db.js'

const app = createApp()
const ORIGIN = env.PUBLIC_ORIGIN
const PASSWORD = 'correct horse battery'

beforeEach(async () => {
  await resetDb()
})

const signInWith = (agent: request.Agent | ReturnType<typeof request>, username: string, password: string) =>
  agent.post('/api/auth/sign-in/username').set('Origin', ORIGIN).send({ username, password, rememberMe: true }) // the server shortens it anyway

describe('staff sign-in with username and password', () => {
  it('signs an admin in, whatever the case of the username typed; the session lasts a day even if asked to remember', async () => {
    await createStaff({ username: 'admin', role: 'admin', password: PASSWORD, name: 'Minh' })
    const agent = request.agent(app)
    await signInWith(agent, 'Admin', PASSWORD).expect(200)
    expect(await meOf(agent)).toMatchObject({ name: 'Minh', role: 'admin', is_anonymous: false })
    await agent.post('/api/v1/admin/users/list').set('Origin', ORIGIN).send({}).expect(200)
    const { rows } = await pool.query<{ hours: number }>(
      `SELECT (extract(epoch FROM expires_at - NOW()) / 3600)::float8 AS hours FROM auth_sessions
       WHERE user_id = (SELECT id FROM users WHERE username = 'admin')`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.hours).toBeLessThanOrEqual(24)
    expect(rows[0]?.hours).toBeGreaterThan(23)
  })

  it('a wrong password and an unknown username get the same answer', async () => {
    await createStaff({ username: 'linh', role: 'reviewer', password: PASSWORD })
    const wrong = await signInWith(request(app), 'linh', 'not the password').expect(401)
    const unknown = await signInWith(request(app), 'nobody', PASSWORD).expect(401)
    expect(wrong.body).toEqual(unknown.body)
  })

  it('the password is stored hashed, never as typed', async () => {
    await createStaff({ username: 'linh', role: 'reviewer', password: PASSWORD })
    const { rows } = await pool.query<{ password: string; provider_id: string }>(
      'SELECT password, provider_id FROM auth_accounts',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.provider_id).toBe('credential')
    expect(rows[0]?.password).not.toContain(PASSWORD)
  })

  it('no sign-up, no reset by email, no username probing, no sign-in links', async () => {
    const closed = [
      ['/sign-up/email', { email: 'x@example.com', password: PASSWORD, name: 'X', username: 'xavier' }],
      ['/sign-in/email', { email: 'x@example.com', password: PASSWORD }],
      ['/request-password-reset', { email: 'x@example.com' }],
      ['/is-username-available', { username: 'admin' }],
      ['/sign-in/magic-link', { email: 'x@example.com' }],
    ] as const
    for (const [path, body] of closed) {
      const res = await request(app).post(`/api/auth${path}`).set('Origin', ORIGIN).send(body)
      expect(res.status, path).toBeGreaterThanOrEqual(400)
    }
    const { rows } = await pool.query('SELECT 1 FROM users')
    expect(rows).toEqual([])
  })

  it('an anonymous participant who signs in as staff on the same browser keeps the posts', async () => {
    await createStaff({ username: 'linh', role: 'reviewer', password: PASSWORD, name: 'Linh' })
    const agent = await signIn(app)
    const before = await meOf(agent)
    await agent
      .post('/api/v1/spots')
      .set('Origin', ORIGIN)
      .send({ name: 'Canal', photo_category: 'bridge', lng: 2.3655, lat: 48.8712 })
      .expect(201)
    await signInWith(agent, 'linh', PASSWORD).expect(200)
    const after = await meOf(agent)
    expect(after).toMatchObject({ name: 'Linh', role: 'reviewer' })
    const { rows } = await pool.query('SELECT created_by FROM pois WHERE name = $1', ['Canal'])
    expect(rows).toEqual([{ created_by: after.id }])
    expect(after.id).not.toBe(before.id)
  })
})
