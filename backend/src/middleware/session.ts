import type { Request, RequestHandler } from 'express'
import { AppError } from '../lib/errors.js'
import { can, type Permission } from '../lib/permissions.js'
import type { AuthUser } from '../modules/auth/auth.service.js'

type ReadSessionUser = (req: Request) => Promise<AuthUser | null>

const LOADED = Symbol('sessionLoaded')
type WithMarker = Request & { [LOADED]?: true }

// Built around a session reader so the rules can be unit-tested without Better Auth or a database.
export function sessionMiddlewares(readSessionUser: ReadSessionUser) {
  async function load(req: WithMarker): Promise<void> {
    if (req[LOADED]) return
    const user = await readSessionUser(req)
    if (user) req.user = user
    req[LOADED] = true
  }

  // Attaches req.user when the request carries a valid session cookie; visitors pass through.
  const loadUser: RequestHandler = async (req, _res, next) => {
    try {
      await load(req)
      next()
    } catch (err) {
      next(err)
    }
  }

  const requireUser: RequestHandler = async (req, _res, next) => {
    try {
      await load(req)
      if (!req.user) return next(new AppError('UNAUTHENTICATED', 401, 'Sign in required'))
      next()
    } catch (err) {
      next(err)
    }
  }

  function requirePermission(permission: Permission): RequestHandler {
    return async (req, _res, next) => {
      try {
        await load(req)
        if (!req.user) return next(new AppError('UNAUTHENTICATED', 401, 'Sign in required'))
        if (!can(req.user, permission)) return next(new AppError('FORBIDDEN', 403, `Requires permission ${permission}`))
        next()
      } catch (err) {
        next(err)
      }
    }
  }

  return { loadUser, requireUser, requirePermission }
}
