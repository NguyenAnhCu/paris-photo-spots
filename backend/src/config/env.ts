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
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
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
  IMAGE_JPEG_QUALITY: z.coerce.number().int().min(1).max(100).default(82),
  WRITE_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  WRITE_RATE_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
})

export type Env = z.infer<typeof EnvSchema>

export const env: Env = EnvSchema.parse(process.env)

export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim())
