// Database helpers for the E2E database: create + migrate once, then reset and seed before every spec file.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import pg from 'pg'
import { COMMONS_COVER, SPOTS, STOPS, type SpotKey } from '../fixtures/spots.js'
import { DATABASE_URL, ROOT_DIR } from './env.js'

async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export async function prepareDatabase(): Promise<void> {
  const url = new URL(DATABASE_URL)
  const name = url.pathname.slice(1)
  const admin = new URL(DATABASE_URL)
  admin.pathname = '/postgres'
  await withClient(admin.toString(), async (client) => {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (!rowCount) await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`)
  })
  execFileSync('npx', ['node-pg-migrate', 'up', '--migrations-dir', 'db/migrations'], {
    cwd: path.join(ROOT_DIR, 'backend'),
    env: { ...process.env, DATABASE_URL },
    stdio: 'pipe',
  })
}

export async function resetAndSeed(): Promise<void> {
  await withClient(DATABASE_URL, async (client) => {
    await client.query('TRUNCATE pois, photos, transit_stops, regions, import_runs')
    for (const s of STOPS) {
      await client.query(
        `INSERT INTO transit_stops (gtfs_stop_id, name, modes, lines, navigo_zone, geom)
         VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326))`,
        [`e2e:${s.key}`, s.name, s.modes, s.lines, s.zone, s.at[0], s.at[1]],
      )
    }
    for (const s of SPOTS) {
      await client.query(
        `INSERT INTO pois (source, source_ref, name, category, photo_category, best_time, tip, name_i18n,
                           cover_photo_url, cover_photo_attribution, deleted_at, geom)
         VALUES ('osm', $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, CASE WHEN $10 THEN NOW() END,
                 ST_SetSRID(ST_MakePoint($11, $12), 4326))`,
        [
          `e2e/${s.key}`,
          s.name,
          s.category,
          s.photoCategory,
          s.bestTime ?? null,
          s.tip ?? null,
          JSON.stringify(s.nameI18n ?? {}),
          s.cover ? COMMONS_COVER : null,
          s.cover ? 'Photo: E2E author, CC BY-SA 4.0' : null,
          s.deleted ?? false,
          s.at[0],
          s.at[1],
        ],
      )
    }
  })
}

export async function spotId(key: SpotKey): Promise<string> {
  return withClient(DATABASE_URL, async (client) => {
    const { rows } = await client.query<{ id: string }>('SELECT id FROM pois WHERE source_ref = $1', [`e2e/${key}`])
    const id = rows[0]?.id
    if (!id) throw new Error(`Spot ${key} is not seeded`)
    return id
  })
}

export async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withClient(DATABASE_URL, async (client) => (await client.query<T>(sql, params)).rows)
}
