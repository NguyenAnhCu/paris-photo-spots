import { fromNodeHeaders } from 'better-auth/node'
import type { Request } from 'express'
import { AppError } from '../../lib/errors.js'
import { sessionMiddlewares } from '../../middleware/session.js'
import { auth } from './auth.js'
import { authService, type AuthUser } from './auth.service.js'

// The middlewares routes use: loadUser (optional session), requireUser, requirePermission(p).
// Role and anonymity are read from the database on each request (session lookup), so a role change or a suspension
// applies at once, without waiting for a token to expire.
export const { loadUser, requireUser, requirePermission } = sessionMiddlewares(async (req) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  return session ? authService.toAuthUser(session.user) : null
})

// For handlers behind requireUser / requirePermission.
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new AppError('UNAUTHENTICATED', 401, 'Sign in required')
  return req.user
}
