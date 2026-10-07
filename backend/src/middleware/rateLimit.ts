import { rateLimit } from 'express-rate-limit'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'

// Per IP on every write, on top of the per-person daily quota: one person can hold many anonymous identities.
// Per IP = req.ip, which is the client address once Express trusts the reverse proxy (`trust proxy`, deploy phase).
export const writeRateLimit = rateLimit({
  windowMs: env.WRITE_RATE_WINDOW_MINUTES * 60_000,
  limit: env.WRITE_RATE_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new AppError('RATE_LIMITED', 429, 'Too many submissions, try again later')),
})

// Creating identities and trying recovery codes. Here and not in Better Auth's own limiter: that one could not tell
// clients apart without a forwarded-IP header and put everyone in one shared bucket (10 sign-ins a minute for the
// whole app).
export const authRateLimit = rateLimit({
  windowMs: 60_000,
  limit: env.AUTH_RATE_LIMIT_PER_MINUTE,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new AppError('RATE_LIMITED', 429, 'Too many attempts, try again later')),
})
