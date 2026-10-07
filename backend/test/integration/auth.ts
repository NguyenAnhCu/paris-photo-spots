// Signed-in participants for integration tests: supertest agents keep the session cookie between requests.
import type { Express } from 'express'
import request from 'supertest'
import { env } from '../../src/config/env.js'
import { pool } from '../../src/db/pool.js'

export type Agent = ReturnType<typeof request.agent>
export const ORIGIN = env.PUBLIC_ORIGIN

// A visitor who posted once: anonymous identity, current terms accepted (unless told otherwise).
export async function signIn(app: Express, opts: { acceptTerms?: boolean; lang?: string } = {}): Promise<Agent> {
  const agent = request.agent(app)
  await agent
    .post('/api/auth/sign-in/anonymous')
    .set('Origin', ORIGIN)
    .set('x-ui-lang', opts.lang ?? 'vi')
    .send({})
    .expect(200)
  if (opts.acceptTerms ?? true) {
    await agent.post('/api/v1/me/terms').set('Origin', ORIGIN).send({ version: env.TERMS_VERSION }).expect(200)
  }
  return agent
}

export type Me = {
  id: string
  name: string
  role: string
  is_anonymous: boolean
  has_recovery_code: boolean
  terms_accepted: boolean
  posting_suspended_until: string | null
}

export async function meOf(agent: Agent): Promise<Me> {
  return (await agent.get('/api/v1/me').expect(200)).body.user
}

export async function setRole(agent: Agent, role: 'participant' | 'reviewer' | 'admin'): Promise<void> {
  await pool.query('UPDATE users SET role = $2, is_anonymous = false WHERE id = $1', [(await meOf(agent)).id, role])
}
