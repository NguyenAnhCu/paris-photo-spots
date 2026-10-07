// Database helpers for integration tests: wipe the data tables and load the place fixtures.
import { vi } from 'vitest'
import { pool } from '../../src/db/pool.js'
import { REGION_7E, SPOTS, STOPS, type SpotKey, type StopKey } from '../fixtures/places.js'

export async function resetDb(): Promise<void> {
  await pool.query(
    'TRUNCATE pois, photos, transit_stops, regions, import_runs, users, auth_sessions, auth_accounts, auth_verifications',
  )
}

export type Seeded = { spot: Record<SpotKey, string>; stop: Record<StopKey, string> }

export async function seedPlaces(): Promise<Seeded> {
  const seeded = { spot: {}, stop: {} } as Seeded
  for (const s of STOPS) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO transit_stops (gtfs_stop_id, name, modes, lines, navigo_zone, geom)
       VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326)) RETURNING id`,
      [`test:${s.key}`, s.name, s.modes, s.lines, s.zone, s.at[0], s.at[1]],
    )
    seeded.stop[s.key] = rows[0]?.id ?? ''
  }
  for (const s of SPOTS) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO pois (source, source_ref, name, category, photo_category, popularity, name_i18n, cover_photo_url,
                         cover_photo_attribution, deleted_at, geom)
       VALUES ('osm', $1, $2, $3, $4, $5, $6::jsonb, $7, $8, CASE WHEN $9 THEN NOW() END,
               ST_SetSRID(ST_MakePoint($10, $11), 4326))
       RETURNING id`,
      [
        `test/${s.key}`,
        s.name,
        s.category,
        s.photoCategory,
        s.popularity ?? null,
        JSON.stringify(s.nameI18n ?? {}),
        s.cover ?? null,
        s.cover ? 'Photo: Test author, CC BY-SA 4.0' : null,
        s.deleted ?? false,
        s.at[0],
        s.at[1],
      ],
    )
    seeded.spot[s.key] = rows[0]?.id ?? ''
  }
  await pool.query(
    `INSERT INTO regions (code, name, type, geom)
     VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))`,
    [
      REGION_7E.code,
      REGION_7E.name,
      REGION_7E.type,
      JSON.stringify({ type: 'Polygon', coordinates: [REGION_7E.ring] }),
    ],
  )
  return seeded
}

// Generated rows to give the planner a reason to use indexes (EXPLAIN tests); ANALYZE so it knows the sizes.
export async function seedBulk({ pois, photosPerPoi }: { pois: number; photosPerPoi: number }): Promise<void> {
  await pool.query(
    `INSERT INTO pois (source, source_ref, name, category, photo_category, geom)
     SELECT 'bulk', 'bulk/' || i, 'Bulk ' || i, 'monument', 'landmark',
            ST_SetSRID(ST_MakePoint(2.25 + random() * 0.2, 48.81 + random() * 0.09), 4326)
     FROM generate_series(1, $1) AS i`,
    [pois],
  )
  await pool.query(
    `INSERT INTO photos (poi_id, file_name, thumb_name, width, height)
     SELECT p.id, 'bulk.jpg', 'bulk_thumb.jpg', 100, 100
     FROM pois p, generate_series(1, $1)
     WHERE p.source = 'bulk'`,
    [photosPerPoi],
  )
  await pool.query('ANALYZE pois; ANALYZE photos')
}

// The first SQL statement (and its parameters) a repository call sends, to EXPLAIN exactly what the app runs.
export async function firstQueryOf(call: () => Promise<unknown>): Promise<[string, unknown[]]> {
  const spy = vi.spyOn(pool, 'query')
  try {
    await call()
    const [sql, params] = spy.mock.calls[0] as unknown as [string, unknown[]]
    return [sql, params ?? []]
  } finally {
    spy.mockRestore()
  }
}

type PlanNode = { 'Node Type': string; 'Relation Name'?: string; 'Index Name'?: string; Plans?: PlanNode[] }

// Flattened EXPLAIN (FORMAT JSON) nodes, to assert which scans the planner picked.
export async function planNodes(sql: string, params: unknown[]): Promise<PlanNode[]> {
  const { rows } = await pool.query<{ 'QUERY PLAN': { Plan: PlanNode }[] }>(`EXPLAIN (FORMAT JSON) ${sql}`, params)
  const out: PlanNode[] = []
  const walk = (n: PlanNode) => {
    out.push(n)
    n.Plans?.forEach(walk)
  }
  const root = rows[0]?.['QUERY PLAN'][0]?.Plan
  if (root) walk(root)
  return out
}
