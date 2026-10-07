// Admin over HTTP with a real database: users, roles (never losing the last admin), suspensions, account deletion,
// the moderation log; plus the two command-line tools (user:role, cleanup).
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup } from '../../db/admin/cleanup.js'
import { createStaff, setStaffPassword, setStaffRole } from '../../db/admin/staff.js'
import { createApp } from '../../src/app.js'
import { env } from '../../src/config/env.js'
import { pool } from '../../src/db/pool.js'
import { STORAGE_ROOT } from '../../src/storage/photoStorage.js'
import { pngImage } from '../fixtures/images.js'
import { meOf, setRole, signIn, type Agent } from './auth.js'
import { resetDb, seedPlaces, type Seeded } from './db.js'

const app = createApp()
const PASSWORD = 'correct horse battery'
const ORIGIN = env.PUBLIC_ORIGIN
let seeded: Seeded
let admin: Agent
let adminId: string

beforeEach(async () => {
  await resetDb()
  seeded = await seedPlaces()
  admin = await signIn(app)
  await setRole(admin, 'admin')
  adminId = (await meOf(admin)).id
})

const post = (agent: Agent, path: string, body: object) => agent.post(`/api/v1/admin${path}`).send(body)

describe('access', () => {
  it('reviewers and participants get 403, visitors 401', async () => {
    const reviewer = await signIn(app)
    await setRole(reviewer, 'reviewer')
    const participant = await signIn(app)
    for (const path of ['/users/list', '/users/set-role', '/users/suspend', '/users/delete', '/moderation-log/list']) {
      await post(reviewer, path, {}).expect(403)
      await post(participant, path, {}).expect(403)
      await request(app).post(`/api/v1/admin${path}`).send({}).expect(401)
    }
    await reviewer.get('/api/v1/admin/config').expect(403)
  })
})

describe('users', () => {
  it('lists staff first, finds by name or username, hides placeholder emails', async () => {
    await signIn(app) // anonymous participant
    await createStaff({ username: 'minh.t', role: 'reviewer', password: PASSWORD, name: 'Minh' })
    const all = (await post(admin, '/users/list', {}).expect(200)).body
    expect(
      all.items
        .slice(0, 2)
        .map((u: { role: string }) => u.role)
        .sort(),
    ).toEqual(['admin', 'reviewer'])
    const anonymous = all.items.find((u: { is_anonymous: boolean }) => u.is_anonymous)
    expect(anonymous.email).toBeNull()
    const found = (await post(admin, '/users/list', { search: 'minh.t' }).expect(200)).body
    expect(found.items).toEqual([
      expect.objectContaining({ name: 'Minh', username: 'minh.t', email: null, role: 'reviewer' }),
    ])
  })

  it('makes a linked account a reviewer (logged); an anonymous identity cannot become staff', async () => {
    const { id } = await createStaff({ username: 'an.le', role: 'participant', password: PASSWORD, name: 'An' })
    await post(admin, '/users/set-role', { user_id: id, role: 'reviewer' }).expect(200)
    const { rows } = await pool.query(
      "SELECT action, note FROM moderation_actions WHERE target_type = 'user' AND target_id = $1",
      [id],
    )
    expect(rows).toEqual([{ action: 'set_role', note: 'reviewer' }])

    const anon = await signIn(app)
    const res = await post(admin, '/users/set-role', { user_id: (await meOf(anon)).id, role: 'reviewer' }).expect(409)
    expect(res.body.error.code).toBe('ANONYMOUS_CANNOT_BE_STAFF')
  })

  it('never removes the last admin (demote or delete), but a second admin makes it possible', async () => {
    const demote = await post(admin, '/users/set-role', { user_id: adminId, role: 'reviewer' }).expect(409)
    expect(demote.body.error.code).toBe('LAST_ADMIN')
    const { id: second } = await createStaff({ username: 'ha.vu', role: 'admin', password: PASSWORD, name: 'Hà' })
    await post(admin, '/users/delete', { user_id: second }).expect(200)
    await post(admin, '/users/set-role', { user_id: adminId, role: 'participant' }).expect(409)
    await createStaff({ username: 'ha.vu2', role: 'admin', password: PASSWORD, name: 'Hà' })
    await post(admin, '/users/set-role', { user_id: adminId, role: 'reviewer' }).expect(200)
  })

  it('suspends for any length and lifts it; admins and oneself cannot be suspended', async () => {
    const participant = await signIn(app)
    const id = (await meOf(participant)).id
    const until = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()
    await post(admin, '/users/suspend', { user_id: id, until, reason_code: 'spam' }).expect(200)
    await participant
      .post('/api/v1/spots')
      .send({ name: 'Spot', photo_category: 'street', lng: 2.3, lat: 48.87 })
      .expect(403)
    await post(admin, '/users/suspend', { user_id: id, until: null }).expect(200)
    await participant
      .post('/api/v1/spots')
      .send({ name: 'Spot', photo_category: 'street', lng: 2.3, lat: 48.87 })
      .expect(201)
    await post(admin, '/users/suspend', { user_id: adminId, until }).expect(403)
  })

  it('deleting an account removes it and its sessions, and takes its posts out of public view', async () => {
    const participant = await signIn(app)
    await setRole(participant, 'reviewer') // posts go public at once
    const id = (await meOf(participant)).id
    const spot = (
      await participant
        .post('/api/v1/spots')
        .send({ name: 'Canal', photo_category: 'bridge', lng: 2.3655, lat: 48.8712 })
        .expect(201)
    ).body
    await post(admin, '/users/delete', { user_id: id }).expect(200)

    expect((await participant.get('/api/v1/me').expect(200)).body.user).toBeNull()
    const { rows } = await pool.query(
      `SELECT (SELECT count(*)::int FROM users WHERE id = $1) AS users,
              (SELECT count(*)::int FROM auth_sessions WHERE user_id = $1) AS sessions,
              (SELECT status FROM pois WHERE id = $2) AS spot_status`,
      [id, spot.id],
    )
    expect(rows[0]).toEqual({ users: 0, sessions: 0, spot_status: 'hidden' })
    await request(app).get(`/api/v1/spots/item?id=${spot.id}`).expect(404)
    await post(admin, '/users/delete', { user_id: adminId }).expect(403)
  })
})

describe('moderation log and config', () => {
  it('lists decisions newest first with who made them and on what', async () => {
    const author = await signIn(app)
    const photo = (
      await author
        .post('/api/v1/photos')
        .field('spot_id', seeded.spot.eiffel)
        .attach('file', await pngImage(), { filename: 'a.png', contentType: 'image/png' })
        .expect(201)
    ).body
    await admin
      .post('/api/v1/moderation/decide')
      .send({ target_type: 'photo', target_id: photo.id, action: 'approve' })
      .expect(200)
    const log = (await post(admin, '/moderation-log/list', {}).expect(200)).body
    expect(log.items[0]).toMatchObject({
      action: 'approve',
      target_type: 'photo',
      target_name: 'Tour Eiffel',
      actor_id: adminId,
    })
  })

  it('shows the moderation settings (read-only)', async () => {
    const config = (await admin.get('/api/v1/admin/config').expect(200)).body
    expect(config).toMatchObject({ trust_min_approved: expect.any(Number), turnstile: false })
  })
})

describe('command-line tools', () => {
  it('staff create: username + hashed password, display name defaults to the username, placeholder email', async () => {
    const { id, weak } = await createStaff({ username: ' Linh.N ', role: 'reviewer', password: PASSWORD })
    expect(weak).toBe(false)
    const { rows } = await pool.query(
      'SELECT username, display_username, display_name, email, role, is_anonymous FROM users WHERE id = $1',
      [id],
    )
    expect(rows[0]).toEqual({
      username: 'linh.n',
      display_username: 'linh.n',
      display_name: 'linh.n',
      email: 'linh.n@staff.placeholder.invalid',
      role: 'reviewer',
      is_anonymous: false,
    })
    await expect(createStaff({ username: 'LINH.N', role: 'admin', password: PASSWORD })).rejects.toThrow(
      /already exists/,
    )
    await expect(createStaff({ username: 'li', role: 'admin', password: PASSWORD })).rejects.toThrow(
      /Not a valid username/,
    )
    await expect(createStaff({ username: 'linh2', role: 'admin', password: PASSWORD, name: '<b>' })).rejects.toThrow(
      /Not a valid name/,
    )
    const count = await pool.query('SELECT count(*)::int AS n FROM users')
    expect(count.rows[0].n).toBe(2) // the admin from beforeEach + linh.n: nothing half-written
  })

  it('production refuses a weak password; elsewhere it is allowed and reported as weak', async () => {
    await expect(createStaff({ username: 'boss', role: 'admin', password: 'admin', production: true })).rejects.toThrow(
      /at least 12/,
    )
    await expect(createStaff({ username: 'boss', role: 'admin', password: 'boss', production: true })).rejects.toThrow()
    expect((await pool.query("SELECT 1 FROM users WHERE username = 'boss'")).rows).toEqual([])
    const dev = await createStaff({ username: 'admin2', role: 'admin', password: 'admin', production: false })
    expect(dev.weak).toBe(true)
    await request(app)
      .post('/api/auth/sign-in/username')
      .set('Origin', ORIGIN)
      .send({ username: 'admin2', password: 'admin' })
      .expect(200)
  })

  it('staff password: the old one stops working and every session of that person is signed out', async () => {
    await createStaff({ username: 'linh', role: 'reviewer', password: PASSWORD })
    const agent = request.agent(app)
    await agent
      .post('/api/auth/sign-in/username')
      .set('Origin', ORIGIN)
      .send({ username: 'linh', password: PASSWORD })
      .expect(200)
    await setStaffPassword({ username: 'Linh', password: 'a brand new passphrase' })
    expect((await agent.get('/api/v1/me').expect(200)).body.user).toBeNull()
    const signInAs = (password: string) =>
      request(app).post('/api/auth/sign-in/username').set('Origin', ORIGIN).send({ username: 'linh', password })
    await signInAs(PASSWORD).expect(401)
    await signInAs('a brand new passphrase').expect(200)
    await expect(setStaffPassword({ username: 'nobody', password: PASSWORD })).rejects.toThrow(/No account/)
  })

  it('staff role: changes the role of an existing username', async () => {
    const { id } = await createStaff({ username: 'linh', role: 'reviewer', password: PASSWORD })
    await setStaffRole({ username: 'LINH', role: 'admin' })
    expect((await pool.query('SELECT role FROM users WHERE id = $1', [id])).rows).toEqual([{ role: 'admin' }])
    await expect(setStaffRole({ username: 'nobody', role: 'admin' })).rejects.toThrow(/No account/)
  })

  it('cleanup removes expired sessions, idle anonymous identities and files of photos rejected long ago', async () => {
    const now = new Date()
    const old = new Date(now.getTime() - 40 * 24 * 3600 * 1000)
    // An anonymous identity created 40 days ago that never posted; one that posted stays.
    const idle = await signIn(app)
    const idleId = (await meOf(idle)).id
    const active = await signIn(app)
    const activeId = (await meOf(active)).id
    await active
      .post('/api/v1/spots')
      .send({ name: 'Spot', photo_category: 'street', lng: 2.3, lat: 48.87 })
      .expect(201)
    await pool.query('UPDATE users SET created_at = $2 WHERE id = ANY($1)', [[idleId, activeId], old])
    // A photo rejected 40 days ago, with its files on disk.
    const dir = path.join(STORAGE_ROOT, 'photos')
    await mkdir(dir, { recursive: true })
    for (const f of ['old.jpg', 'old_thumb.jpg']) await writeFile(path.join(dir, f), 'x')
    await pool.query(
      `INSERT INTO photos (poi_id, file_name, thumb_name, width, height, status, reviewed_at)
       VALUES ($1, 'old.jpg', 'old_thumb.jpg', 1, 1, 'rejected', $2)`,
      [seeded.spot.eiffel, old],
    )
    await pool.query("UPDATE auth_sessions SET expires_at = NOW() - interval '1 day' WHERE user_id = $1", [activeId])

    const done = await cleanup(now)
    expect(done).toMatchObject({ anonymousUsers: 1, rejectedPhotos: 1 })
    expect(done.sessions).toBeGreaterThanOrEqual(1)
    const { rows } = await pool.query('SELECT id FROM users WHERE id = ANY($1)', [[idleId, activeId]])
    expect(rows).toEqual([{ id: activeId }])
    await expect(access(path.join(dir, 'old.jpg'))).rejects.toThrow()
    expect((await active.get('/api/v1/me').expect(200)).body.user).toBeNull() // its expired session is gone
  })
})
