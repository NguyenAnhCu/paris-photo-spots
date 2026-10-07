// Runs in each integration worker before the test file is imported, so config/env.ts and db/pool.ts see the container.
import { afterAll, inject } from 'vitest'

process.env.DATABASE_URL = inject('databaseUrl')
// Test files post many spots/photos from one IP; the limiter itself is tested in rateLimit.test.ts with a small limit.
process.env.WRITE_RATE_LIMIT ??= '10000'
// Same for the per-person daily quotas (tested with small values in quota.test.ts).
process.env.QUOTA_ANON_SPOTS_PER_DAY ??= '10000'
process.env.QUOTA_ANON_PHOTOS_PER_DAY ??= '10000'
process.env.AUTH_RATE_LIMIT_PER_MINUTE ??= '10000'

// Each test file gets its own module graph, hence its own pool: close it so the worker can exit.
afterAll(async () => {
  const { pool } = await import('../../src/db/pool.js')
  await pool.end()
})
