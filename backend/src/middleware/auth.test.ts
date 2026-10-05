import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { describe, expect, it, vi } from 'vitest'
import { env } from '../config/env.js'
import { authenticate, hasRole, requireRole } from './auth.js'

const USER_ID = '2f1c4d6e-8a9b-4c3d-9e1f-0a2b3c4d5e6f'
const token = (payload: object, secret = env.JWT_SECRET) => jwt.sign(payload, secret, { expiresIn: '1h' })

function runAuthenticate(authorization?: string) {
  const req = { headers: authorization ? { authorization } : {} } as Request
  const next = vi.fn()
  authenticate(req, {} as Response, next)
  return { req, error: next.mock.calls[0]?.[0] }
}

describe('authenticate', () => {
  it('lets anonymous requests through without a user', () => {
    const { req, error } = runAuthenticate()
    expect(error).toBeUndefined()
    expect(req.user).toBeUndefined()
  })

  it('attaches the user from a valid Bearer token', () => {
    const { req, error } = runAuthenticate(`Bearer ${token({ sub: USER_ID, role: 'editor' })}`)
    expect(error).toBeUndefined()
    expect(req.user).toEqual({ id: USER_ID, role: 'editor' })
  })

  it.each([
    ['a token signed with another secret', () => token({ sub: USER_ID, role: 'editor' }, 'x'.repeat(40))],
    ['an unknown role', () => token({ sub: USER_ID, role: 'superuser' })],
    [
      'an expired token',
      () => jwt.sign({ sub: USER_ID, role: 'viewer', exp: Math.floor(Date.now() / 1000) - 60 }, env.JWT_SECRET),
    ],
    ['garbage', () => 'not-a-jwt'],
  ])('rejects %s with 401 INVALID_TOKEN', (_label, make) => {
    const { error } = runAuthenticate(`Bearer ${make()}`)
    expect(error).toMatchObject({ code: 'INVALID_TOKEN', status: 401 })
  })
})

describe('hasRole / requireRole', () => {
  it('orders roles viewer < contributor < editor < admin', () => {
    expect(hasRole({ id: USER_ID, role: 'admin' }, 'editor')).toBe(true)
    expect(hasRole({ id: USER_ID, role: 'contributor' }, 'editor')).toBe(false)
    expect(hasRole(undefined, 'viewer')).toBe(true)
  })

  it('answers 401 without a user and 403 with a too-low role', () => {
    const next = vi.fn()
    requireRole('editor')({} as Request, {} as Response, next)
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })

    requireRole('editor')({ user: { id: USER_ID, role: 'viewer' } } as Request, {} as Response, next)
    expect(next.mock.calls[1]?.[0]).toMatchObject({ code: 'FORBIDDEN', status: 403 })

    requireRole('editor')({ user: { id: USER_ID, role: 'editor' } } as Request, {} as Response, next)
    expect(next.mock.calls[2]).toEqual([])
  })
})
