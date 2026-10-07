// Every migration must apply, roll back and re-apply on an empty database (a broken Down section is only found
// the day it is needed). Uses its own database in the test container so the shared one is untouched.
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'db', 'migrations')
const MIGRATION_COUNT = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).length
const DB_NAME = 'pmv_migrations_check'

const adminUrl = process.env.DATABASE_URL ?? ''
const url = new URL(adminUrl)
url.pathname = `/${DB_NAME}`
const migrationsUrl = url.toString()

const migrate = (...args: string[]) =>
  execFileSync('npx', ['node-pg-migrate', ...args, '--migrations-dir', 'db/migrations'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: migrationsUrl },
    stdio: 'pipe',
  })

async function publicTables(): Promise<string[]> {
  const client = new pg.Client({ connectionString: migrationsUrl })
  await client.connect()
  try {
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         AND table_name NOT IN ('pgmigrations', 'spatial_ref_sys')
       ORDER BY table_name`,
    )
    return rows.map((r) => r.table_name)
  } finally {
    await client.end()
  }
}

async function admin(sql: string) {
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

beforeAll(async () => {
  await admin(`DROP DATABASE IF EXISTS ${DB_NAME}`)
  await admin(`CREATE DATABASE ${DB_NAME}`)
})
afterAll(async () => {
  await admin(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`)
})

describe('migrations', () => {
  const ALL_TABLES = [
    'auth_accounts',
    'auth_sessions',
    'auth_verifications',
    'import_runs',
    'itineraries',
    'itinerary_stops',
    'moderation_actions',
    'photos',
    'pois',
    'regions',
    'reports',
    'transit_stops',
    'user_region_scopes',
    'users',
  ]

  it(`apply, roll back and re-apply all ${MIGRATION_COUNT} migrations`, async () => {
    migrate('up')
    expect(await publicTables()).toEqual(ALL_TABLES)

    migrate('down', String(MIGRATION_COUNT))
    expect(await publicTables()).toEqual([])

    migrate('up')
    expect(await publicTables()).toEqual(ALL_TABLES)
  }, 120_000)
})
