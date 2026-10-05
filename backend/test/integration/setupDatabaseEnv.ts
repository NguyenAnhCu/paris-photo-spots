// Runs in each integration worker before the test file is imported, so config/env.ts and db/pool.ts see the container.
import { inject } from 'vitest'

process.env.DATABASE_URL = inject('databaseUrl')
