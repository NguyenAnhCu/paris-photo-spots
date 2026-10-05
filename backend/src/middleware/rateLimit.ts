import { rateLimit } from 'express-rate-limit'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'

// No authentication yet (decision 2026-10-05): per-IP limits on every write endpoint are the only abuse protection.
// Must be replaced by auth + moderation before the app is public.
export const writeRateLimit = rateLimit({
  windowMs: env.WRITE_RATE_WINDOW_MINUTES * 60_000,
  limit: env.WRITE_RATE_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new AppError('RATE_LIMITED', 429, 'Too many submissions, try again later')),
})
