// Staff sign in with a one-time link. No email service yet: the link is written to AUTH_MAGIC_LINK_LOG (env.ts reads
// it on import, so src/ is imported after setting it).
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

const LOG = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmv-links-')), 'links.jsonl')
process.env.AUTH_MAGIC_LINK_LOG = LOG
const { createApp } = await import('../../src/app.js')
const { env } = await import('../../src/config/env.js')
const { pool } = await import('../../src/db/pool.js')
const { resetDb } = await import('./db.js')
const { meOf } = await import('./auth.js')

const app = createApp()

beforeEach(async () => {
  await resetDb()
})

async function lastLink(email: string): Promise<URL> {
  const lines = (await readFile(LOG, 'utf8')).trim().split('\n')
  const entry = lines.map((l) => JSON.parse(l) as { email: string; url: string }).findLast((e) => e.email === email)
  if (!entry) throw new Error(`no link for ${email}`)
  return new URL(entry.url)
}

describe('staff sign-in link', () => {
  it('signs an existing reviewer in and redirects to the review page', async () => {
    await pool.query(
      `INSERT INTO users (email, email_verified, display_name, role) VALUES ('linh@team.example', true, 'Linh', 'reviewer')`,
    )
    const agent = request.agent(app)
    await agent
      .post('/api/auth/sign-in/magic-link')
      .set('Origin', env.PUBLIC_ORIGIN)
      .send({ email: 'linh@team.example', callbackURL: '/review' })
      .expect(200)

    const link = await lastLink('linh@team.example')
    expect(link.pathname).toBe('/api/auth/magic-link/verify')
    const res = await agent.get(link.pathname + link.search).expect(302)
    expect(res.headers.location).toBe(`${env.PUBLIC_ORIGIN}/review`)
    expect(await meOf(agent)).toMatchObject({ name: 'Linh', role: 'reviewer', is_anonymous: false })
  })

  it('an unknown email gets no account (no sign-up through links)', async () => {
    const agent = request.agent(app)
    await agent
      .post('/api/auth/sign-in/magic-link')
      .set('Origin', env.PUBLIC_ORIGIN)
      .send({ email: 'stranger@example.com', callbackURL: '/review' })
      .expect(200) // same answer as for a known email: no account probing
    const link = await lastLink('stranger@example.com')
    await agent.get(link.pathname + link.search)
    expect((await agent.get('/api/v1/me').expect(200)).body.user).toBeNull()
    const { rows } = await pool.query("SELECT 1 FROM users WHERE email = 'stranger@example.com'")
    expect(rows).toEqual([])
  })

  it('a link works once', async () => {
    await pool.query(
      `INSERT INTO users (email, email_verified, display_name, role) VALUES ('minh@team.example', true, 'Minh', 'admin')`,
    )
    await request(app)
      .post('/api/auth/sign-in/magic-link')
      .set('Origin', env.PUBLIC_ORIGIN)
      .send({ email: 'minh@team.example', callbackURL: '/review' })
      .expect(200)
    const link = await lastLink('minh@team.example')
    await request(app)
      .get(link.pathname + link.search)
      .expect(302)
    const second = request.agent(app)
    await second.get(link.pathname + link.search)
    expect((await second.get('/api/v1/me').expect(200)).body.user).toBeNull()
  })
})
