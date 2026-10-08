import type { NextFunction, Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '../modules/auth/auth.service.js'
import { sessionMiddlewares } from './session.js'

const participant: AuthUser = { id: 'u1', role: 'participant', isAnonymous: true, name: 'Lữ khách 1234' }
const reviewer: AuthUser = { ...participant, id: 'u2', role: 'reviewer', isAnonymous: false }

async function run(handler: (req: Request, res: Response, next: NextFunction) => unknown, req = {} as Request) {
  const next = vi.fn()
  await handler(req, {} as Response, next)
  return { req, error: next.mock.calls[0]?.[0] as unknown, called: next.mock.calls.length }
}

describe('loadUser', () => {
  it('attaches the user of a valid session', async () => {
    const { loadUser } = sessionMiddlewares(async () => participant)
    const { req, error } = await run(loadUser)
    expect(error).toBeUndefined()
    expect(req.user).toEqual(participant)
  })

  it('lets visitors without a session through', async () => {
    const { loadUser } = sessionMiddlewares(async () => null)
    const { req, error, called } = await run(loadUser)
    expect(error).toBeUndefined()
    expect(called).toBe(1)
    expect(req.user).toBeUndefined()
  })

  it('reads the session once per request', async () => {
    const read = vi.fn(async () => participant)
    const { loadUser, requireUser } = sessionMiddlewares(read)
    const req = {} as Request
    await run(loadUser, req)
    await run(requireUser, req)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('passes a session lookup failure on (500), never treats it as "no session"', async () => {
    const { loadUser } = sessionMiddlewares(async () => {
      throw new Error('db down')
    })
    const { error } = await run(loadUser)
    expect(error).toBeInstanceOf(Error)
  })
})

describe('requireUser / requirePermission', () => {
  it('401 UNAUTHENTICATED without a session', async () => {
    const { requireUser, requirePermission } = sessionMiddlewares(async () => null)
    expect((await run(requireUser)).error).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
    expect((await run(requirePermission('post'))).error).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
  })

  it('403 FORBIDDEN when the role lacks the permission', async () => {
    const { requirePermission } = sessionMiddlewares(async () => participant)
    expect((await run(requirePermission('moderate'))).error).toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })

  it('passes when the role has it', async () => {
    const { requirePermission } = sessionMiddlewares(async () => reviewer)
    const { error, called, req } = await run(requirePermission('moderate'))
    expect(error).toBeUndefined()
    expect(called).toBe(1)
    expect(req.user).toEqual(reviewer)
  })
})
