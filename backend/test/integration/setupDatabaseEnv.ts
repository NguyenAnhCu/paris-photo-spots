// Runs in each integration worker before the test file is imported, so config/env.ts and db/pool.ts see the container.
import { afterAll, inject } from 'vitest'

process.env.DATABASE_URL = inject('databaseUrl')
// Test files post many spots/photos from one IP; the limiter itself is tested in rateLimit.test.ts with a small limit.
process.env.WRITE_RATE_LIMIT ??= '10000'

// Each test file gets its own module graph, hence its own pool: close it so the worker can exit.
afterAll(async () => {
  const { pool } = await import('../../src/db/pool.js')
  await pool.end()
})
