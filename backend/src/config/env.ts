import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30_000),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(5_000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(10_000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  // Accounts & sessions (Better Auth). The secret signs session cookies: keep it out of the repo, rotate = everyone signs in again.
  BETTER_AUTH_SECRET: z.string().min(32),
  // Origin the browser uses (web app and /api behind one host): base of auth URLs and the only trusted Origin for writes.
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:5173'),
  SESSION_EXPIRES_DAYS: z.coerce.number().int().positive().default(365),
  SESSION_UPDATE_AGE_HOURS: z.coerce.number().int().positive().default(24),
  // Cloudflare Turnstile on anonymous sign-in and recovery-code sign-in; empty = off (dev, tests).
  TURNSTILE_SECRET_KEY: z.string().default(''),
  // Version of the terms a participant must have accepted before posting (draft until the legal phase, P7).
  TERMS_VERSION: z.string().min(1).default('draft-1'),
  // Posts per rolling 24 h. Linked accounts get QUOTA_LINKED_MULTIPLIER times more; reviewers/admins have none.
  QUOTA_ANON_PHOTOS_PER_DAY: z.coerce.number().int().positive().default(10),
  QUOTA_ANON_SPOTS_PER_DAY: z.coerce.number().int().positive().default(3),
  QUOTA_LINKED_MULTIPLIER: z.coerce.number().int().positive().default(3),
  // Moderation: a linked participant's posts go public at once after this many approved posts, unless something of
  // theirs was rejected in the last TRUST_WINDOW_DAYS days. Reviewers may suspend posting for up to this many days.
  TRUST_MIN_APPROVED: z.coerce.number().int().nonnegative().default(3),
  TRUST_WINDOW_DAYS: z.coerce.number().int().positive().default(30),
  REVIEWER_SUSPEND_MAX_DAYS: z.coerce.number().int().positive().default(7),
  // Staff sign-in links (magic link). No email service yet: dev and E2E append each link to this file instead.
  AUTH_MAGIC_LINK_LOG: z.string().default(''),
  MAX_RADIUS_M: z.coerce.number().int().positive().default(5000),
  MAX_RESULTS: z.coerce.number().int().positive().default(500),
  MAX_POLYGON_VERTICES: z.coerce.number().int().positive().default(1000),
  TILE_CACHE_SECONDS: z.coerce.number().int().nonnegative().default(300),
  JSON_BODY_LIMIT: z.string().default('200kb'),
  // Photo spots & community photos (no auth yet → limits are the only protection)
  SPOT_DUPLICATE_RADIUS_M: z.coerce.number().int().positive().default(30),
  SPOT_NAME_MIN_LENGTH: z.coerce.number().int().positive().default(3),
  SPOT_NAME_MAX_LENGTH: z.coerce.number().int().positive().default(120),
  SPOT_TIP_MAX_LENGTH: z.coerce.number().int().positive().default(1000),
  // Same walking assumptions as backend/db/import/postprocess.sql (≈ 4.8 km/h, walkable up to 2 km)
  WALK_METERS_PER_MINUTE: z.coerce.number().positive().default(80),
  MAX_WALK_METERS: z.coerce.number().positive().default(2000),
  // Wikimedia only serves standard thumbnail steps; any other width answers HTTP 400 (640 was tried: 400).
  SPOT_LIST_THUMB_WIDTH: z.coerce
    .number()
    .int()
    .refine((w) => [120, 250, 330, 500, 960, 1280, 1920].includes(w), 'Must be a Wikimedia thumbnail step')
    .default(500),
  STORAGE_DIR: z.string().default('storage'),
  MEDIA_CACHE_SECONDS: z.coerce.number().int().nonnegative().default(31_536_000),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
  IMAGE_MAX_EDGE: z.coerce.number().int().positive().default(2048),
  THUMB_EDGE: z.coerce.number().int().positive().default(400),
  // Width × height read from the header before decoding. A JPEG above ~100 MP is already over MAX_UPLOAD_MB.
  IMAGE_MAX_INPUT_PIXELS: z.coerce.number().int().positive().default(100_000_000),
  IMAGE_JPEG_QUALITY: z.coerce.number().int().min(1).max(100).default(82),
  // Graceful stop (SIGTERM on deploy): requests still running after this are cut off.
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  WRITE_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  WRITE_RATE_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  // New identities (anonymous sign-in) and recovery-code attempts per IP per minute: slows down identity farming and
  // code guessing (a code is 80 bits, guessing must still be slow).
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
})

export type Env = z.infer<typeof EnvSchema>

export const env: Env = EnvSchema.parse(process.env)

export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim())
