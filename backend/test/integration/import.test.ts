// The whole import pipeline (runImport) against PostGIS, with every download answered by test/fixtures/importSources.ts.
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportContext } from '../../db/import/context.js'
import { EXIT_FAILED, EXIT_LOCKED, EXIT_OK, IMPORT_LOCK_KEY, runImport } from '../../db/import/runImport.js'
import { loadCuratedSpots } from '../../db/import/sources/curated.js'
import { pool } from '../../src/db/pool.js'
import { commonsThumb, fakeNet, OSM_ELEMENTS, type FakeNetOptions } from '../fixtures/importSources.js'
import { resetDb } from './db.js'

let cacheDir = ''

async function newCacheDir() {
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true })
  cacheDir = await mkdtemp(path.join(os.tmpdir(), 'pmv-import-cache-'))
}

// 'offline': any download fails the test run — proves a run was served from the cache.
async function runWith(net: FakeNetOptions | 'offline', ctx: Partial<ImportContext> = {}) {
  const calls: string[] = []
  const network =
    net === 'offline'
      ? async (input: RequestInfo | URL) => {
          calls.push(String(input))
          throw new Error(`offline: ${String(input)}`)
        }
      : (() => {
          const fake = fakeNet(net)
          return async (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push(String(input))
            return fake.fetch(input, init)
          }
        })()
  vi.stubGlobal('fetch', network)
  const log: string[] = []
  const client = await pool.connect()
  try {
    const result = await runImport(client, {
      refresh: true,
      allowShrink: false,
      cacheDir,
      log: (m) => log.push(m),
      ...ctx,
    })
    return { result, log, calls }
  } finally {
    client.release()
    vi.unstubAllGlobals()
  }
}

// Fingerprint of every imported row (all columns, updated_at included): equal ⇔ nothing was written.
async function snapshot() {
  const { rows } = await pool.query<Record<string, string | null>>(
    `SELECT (SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) FROM pois t) AS pois,
            (SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) FROM transit_stops t) AS stops,
            (SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) FROM regions t) AS regions`,
  )
  return rows[0]
}

type PoiRow = {
  name: string
  source: string
  category: string
  photo_category: string | null
  popularity: number | null
  crowd_level: number
  best_time: string | null
  tip: string | null
  name_i18n: Record<string, string>
  tags: string[]
  website: string | null
  cover_photo_url: string | null
  cover_photo_attribution: string | null
  navigo_zone: number | null
  walk_minutes: number | null
  stop_name: string | null
  stop_lines: string[] | null
}

async function poisNamed(name: string): Promise<PoiRow[]> {
  const { rows } = await pool.query<PoiRow>(
    `SELECT p.name, p.source, p.category, p.photo_category, p.popularity, p.crowd_level, p.best_time, p.tip,
            p.name_i18n, p.tags, p.website, p.cover_photo_url, p.cover_photo_attribution, p.navigo_zone,
            p.walk_minutes, s.name AS stop_name, s.lines AS stop_lines
     FROM pois p LEFT JOIN transit_stops s ON s.id = p.nearest_stop_id
     WHERE p.name = $1 AND p.deleted_at IS NULL
     ORDER BY p.photo_category NULLS LAST`,
    [name],
  )
  return rows
}
async function poi(name: string): Promise<PoiRow> {
  const rows = await poisNamed(name)
  expect(rows, name).toHaveLength(1)
  return rows[0] as PoiRow
}

describe('a full import from the fake sources', () => {
  let result: Awaited<ReturnType<typeof runWith>>['result']

  beforeAll(async () => {
    await resetDb()
    await newCacheDir()
    result = (await runWith({})).result
  })

  it('succeeds and reports what each source changed', async () => {
    expect(result).toMatchObject({ status: 'success', exitCode: EXIT_OK, error: null })
    const curatedCount = (await loadCuratedSpots()).length
    expect(result.stats).toMatchObject({
      regions: { fetched: 4, inserted: 4 }, // arrondissement 75107 + départements 75, 78, 93 (29 is not IDF)
      transit_stops: { fetched: 4, inserted: 3 }, // 4 platforms, 3 stations
      osm: { fetched: 13, inserted: 12, softDeleted: 0 }, // two Champs-Élysées segments merged
      museofile: { fetched: 2, matched: 1, inserted: 1 },
      curated: { fetched: curatedCount, matched: 3, inserted: curatedCount - 3 },
      covers: { fetched: 8, updated: 8 },
    })
    const { rows } = await pool.query(`SELECT status, stats->'osm'->>'fetched' AS osm FROM import_runs`)
    expect(rows).toEqual([{ status: 'success', osm: '13' }])
  })

  it('selects photo spots with the category rules and thresholds', async () => {
    expect((await poi('Tour Eiffel')).photo_category).toBe('landmark')
    expect((await poi('Pont de Sully')).photo_category).toBe('bridge')
    expect((await poi('Tour Saint-Jacques')).photo_category).toBe('skyline')
    expect((await poi('Basilique de Saint-Denis')).photo_category).toBe('suburb') // outside the Paris boundary
    expect((await poi('Petit monument')).photo_category).toBeNull() // 3 sitelinks < 10
    expect((await poi('Musée de Test')).photo_category).toBeNull() // no Wikidata → no popularity
  })

  it('shows one spot per Wikidata item, preferring the more specific category', async () => {
    const champs = await poisNamed('Avenue des Champs-Élysées')
    expect(champs).toHaveLength(2) // merged street segments + the attraction node
    expect(champs.map((c) => [c.category, c.photo_category])).toEqual([
      ['street', 'street'],
      ['monument', null],
    ])
  })

  it('lets curated spots win: category, crowd, best time, tip and Vietnamese name come from the curated file', async () => {
    const pont = await poi('Pont Alexandre III')
    expect(pont).toMatchObject({ source: 'osm', photo_category: 'bridge', crowd_level: 2, best_time: 'sunrise' })
    expect(pont.tip).toMatch(/^Đèn đồng/)
    expect(pont.name_i18n).toEqual({ vi: 'Pont Alexandre III', en: 'Pont Alexandre III' })
    expect(pont.tags).toContain('curated:p1')

    const versailles = await poi('Château de Versailles')
    expect(versailles).toMatchObject({ category: 'day_trip', photo_category: 'suburb' })
    // Curated spots that match no source row are added on their own.
    expect(await poi('Rooftop Printemps')).toMatchObject({ source: 'curated', photo_category: 'rooftop' })

    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pois WHERE deleted_at IS NULL AND photo_category IS NOT NULL`,
    )
    const curatedOnly = (await loadCuratedSpots()).length - 3
    expect(rows[0]?.n).toBe(8 + curatedOnly)
  })

  it('distrusts a Wikidata item whose coordinates are more than 3 km away (a person, not the place)', async () => {
    expect(await poi('Square Test')).toMatchObject({
      popularity: null,
      name_i18n: {},
      photo_category: null,
      cover_photo_url: null,
    })
  })

  it('stores localized names from Wikidata', async () => {
    expect((await poi('Tour Eiffel')).name_i18n).toEqual({ vi: 'Tháp Eiffel', en: 'Eiffel Tower', fr: 'Tour Eiffel' })
  })

  it('links the nearest station with its Navigo zone and walking time', async () => {
    // ≈ 625 m from Bir-Hakeim (average of its two platforms) at 80 m/min → 8 minutes.
    expect(await poi('Tour Eiffel')).toMatchObject({
      stop_name: 'Bir-Hakeim',
      stop_lines: ['M6'],
      navigo_zone: 1,
      walk_minutes: 8,
    })
    expect(await poi('Château de Versailles')).toMatchObject({
      stop_name: 'Versailles Château Rive Gauche',
      stop_lines: ['RER C'],
      navigo_zone: 4,
    })
  })

  it('attaches a Commons cover with attribution to shown spots only', async () => {
    expect(await poi('Tour Eiffel')).toMatchObject({
      cover_photo_url: commonsThumb('Tour Eiffel.jpg'), // tracking query string dropped
      cover_photo_attribution: 'Author of Tour Eiffel.jpg · CC BY-SA 4.0 · Wikimedia Commons',
    })
    const champs = await poisNamed('Avenue des Champs-Élysées')
    expect(champs.map((c) => c.cover_photo_url !== null)).toEqual([true, false])
    expect((await poi('Petit monument')).cover_photo_url).toBeNull()
  })

  it('enriches the matching OSM museum from Muséofile instead of adding a duplicate', async () => {
    const museum = await poi('Musée de Test')
    expect(museum).toMatchObject({ source: 'osm', website: 'https://www.musee-test.fr' })
    expect(museum.tags).toContain('museofile:M0001')
    expect(await poi('Musée du Nouveau monde')).toMatchObject({ source: 'museofile', category: 'museum' })
    expect(await poisNamed('Musée breton')).toEqual([]) // not in Île-de-France
  })
})

describe('re-running', () => {
  beforeEach(async () => {
    await resetDb()
    await newCacheDir()
  })

  // Regression: postprocess.sql rewrote every POI on each run (only updated_at changed) while all sources said "unchanged".
  it('from the cache: no download, every source unchanged, database byte-identical', async () => {
    expect((await runWith({})).result.status).toBe('success')
    const before = await snapshot()

    const { result, calls } = await runWith('offline', { refresh: false })
    expect(calls).toEqual([])
    expect(result.status).toBe('success')
    for (const source of ['regions', 'transit_stops', 'osm', 'museofile', 'curated'] as const) {
      expect(result.stats[source], source).toMatchObject({ inserted: 0, updated: 0, softDeleted: 0 })
    }
    expect(result.stats).toMatchObject({
      wikidata: { updated: 0 },
      photo_categories: { updated: 0 },
      covers: { updated: 0, softDeleted: 0 },
      day_trips: { fixed: 0 },
      derived: { updated: 0 },
    })
    expect(await snapshot()).toEqual(before)
  })
})

describe('safety nets', () => {
  beforeEach(async () => {
    await resetDb()
    await newCacheDir()
    expect((await runWith({})).result.status).toBe('success')
  })

  it('aborts when a source shrinks below 80% of the last successful run; database unchanged', async () => {
    const before = await snapshot()
    const { result } = await runWith({ overpass: { elements: OSM_ELEMENTS.slice(0, 9) } })
    expect(result).toMatchObject({ status: 'aborted', exitCode: EXIT_FAILED })
    expect(result.error).toMatch(/osm: downloaded 9 records, last successful run had 13/)
    expect(await snapshot()).toEqual(before)
    const { rows } = await pool.query(`SELECT status FROM import_runs ORDER BY started_at`)
    expect(rows.map((r) => r.status)).toEqual(['success', 'aborted'])
  })

  it('--allow-shrink accepts the drop and soft-deletes what disappeared (never hard-deletes)', async () => {
    const { result } = await runWith({ overpass: { elements: OSM_ELEMENTS.slice(0, 9) } }, { allowShrink: true })
    expect(result.status).toBe('success')
    expect(result.stats.osm).toMatchObject({ fetched: 9, softDeleted: 4 })
    const { rows } = await pool.query<{ name: string }>(
      `SELECT name FROM pois WHERE source = 'osm' AND deleted_at IS NOT NULL ORDER BY name`,
    )
    expect(rows.map((r) => r.name)).toEqual([
      'Basilique de Saint-Denis',
      'Petit monument',
      'Pont de Sully',
      'Tour Saint-Jacques',
    ])
  })

  it('aborts on an incomplete Overpass answer (remark) and keeps the good cached copy', async () => {
    const [cacheFile] = (await readdir(cacheDir)).filter((f) => f.startsWith('osm-'))
    const cachedBefore = await readFile(path.join(cacheDir, cacheFile ?? ''), 'utf8')
    const before = await snapshot()

    const { result } = await runWith({
      overpass: { remark: 'runtime error: Query timed out in "query" at line 4', elements: OSM_ELEMENTS.slice(0, 2) },
    })
    expect(result).toMatchObject({ status: 'aborted', exitCode: EXIT_FAILED })
    expect(result.error).toMatch(/incomplete result/)
    expect(await snapshot()).toEqual(before)
    expect(await readFile(path.join(cacheDir, cacheFile ?? ''), 'utf8')).toBe(cachedBefore)
  })

  it('rolls back every step when one crashes (Commons down); database unchanged', async () => {
    const before = await snapshot()
    const { result } = await runWith({ commonsStatus: 500 })
    expect(result).toMatchObject({ status: 'failed', exitCode: EXIT_FAILED })
    expect(result.error).toMatch(/HTTP 500/)
    expect(await snapshot()).toEqual(before)
  })

  it('does nothing while another import holds the lock (exit 2)', async () => {
    const other = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await other.connect()
    try {
      await other.query('SELECT pg_advisory_lock($1)', [IMPORT_LOCK_KEY])
      const before = await snapshot()
      const { result, calls } = await runWith({})
      expect(result).toMatchObject({ status: 'skipped_locked', exitCode: EXIT_LOCKED })
      expect(calls).toEqual([])
      expect(await snapshot()).toEqual(before)
    } finally {
      await other.end() // releases the session lock
    }
    // And the lock is free again for the next run.
    expect((await runWith('offline', { refresh: false })).result.status).toBe('success')
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
