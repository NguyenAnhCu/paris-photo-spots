import type { RequestHandler } from 'express'
import { AppError } from '../lib/errors.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Writes are authenticated by cookie, so another site could make a visitor's browser send one (CSRF). SameSite=Lax
// already stops most of it; refusing writes whose Origin is not ours closes the rest. Browsers send Origin on every
// cross-site POST, so a missing header means a non-browser client, which has no victim's cookie to abuse.
export function originCheck(trusted: string[]): RequestHandler {
  const allowed = new Set(trusted)
  return (req, _res, next) => {
    const origin = req.headers.origin
    if (SAFE_METHODS.has(req.method) || origin === undefined || allowed.has(origin)) return next()
    next(new AppError('FORBIDDEN_ORIGIN', 403, 'Request from an untrusted origin'))
  }
}
