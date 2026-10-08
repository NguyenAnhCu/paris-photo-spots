import type { Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { originCheck } from './originCheck.js'

const check = originCheck(['http://localhost:5173', 'https://photos.example'])

function run(method: string, origin?: string) {
  const next = vi.fn()
  const req = { method, headers: origin ? { origin } : {} } as Request
  check(req, {} as Response, next)
  return next.mock.calls[0]?.[0] as unknown
}

describe('originCheck (CSRF guard for cookie-authenticated writes)', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s from a trusted origin passes', (method) => {
    expect(run(method, 'https://photos.example')).toBeUndefined()
  })

  it.each(['POST', 'DELETE'])('%s from another site is refused with 403', (method) => {
    expect(run(method, 'https://evil.example')).toMatchObject({ code: 'FORBIDDEN_ORIGIN', status: 403 })
  })

  it('a "null" origin (sandboxed iframe, file://) is refused', () => {
    expect(run('POST', 'null')).toMatchObject({ code: 'FORBIDDEN_ORIGIN' })
  })

  it('reads are never blocked', () => {
    expect(run('GET', 'https://evil.example')).toBeUndefined()
    expect(run('HEAD', 'https://evil.example')).toBeUndefined()
  })

  it('no Origin header (server-to-server, curl) passes: browsers always send one on cross-site POST', () => {
    expect(run('POST')).toBeUndefined()
  })
})
