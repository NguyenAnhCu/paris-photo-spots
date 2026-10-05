import type { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'

export const ROLES = ['viewer', 'contributor', 'editor', 'admin'] as const
export type Role = (typeof ROLES)[number]

const TokenPayload = z.object({ sub: z.string().uuid(), role: z.enum(ROLES) })
export type AuthUser = { id: string; role: Role }

// Attaches req.user when a valid Bearer token is present; anonymous requests pass through as viewers.
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return next()
  try {
    const payload = TokenPayload.parse(jwt.verify(header.slice('Bearer '.length), env.JWT_SECRET))
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    next(new AppError('INVALID_TOKEN', 401, 'Invalid or expired token'))
  }
}

export function hasRole(user: AuthUser | undefined, minimum: Role): boolean {
  const current = user?.role ?? 'viewer'
  return ROLES.indexOf(current) >= ROLES.indexOf(minimum)
}

export function requireRole(minimum: Role): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError('UNAUTHENTICATED', 401, 'Authentication required'))
    if (!hasRole(req.user, minimum)) return next(new AppError('FORBIDDEN', 403, `Requires role ${minimum}`))
    next()
  }
}
