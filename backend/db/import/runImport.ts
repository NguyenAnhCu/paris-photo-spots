// The import pipeline itself (no process.exit, no argv) so it can be called from the CLI (run.ts) and from tests.
// Safety nets: one transaction, advisory lock, shrink guard (MIN_KEEP_RATIO), runs recorded in import_runs.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'
import type { ImportContext } from './context.js'
import { DAY_TRIP_WIKIDATA } from './day-trips.js'
import { ImportAbortError, type SourceKey, type SourceStats } from './guards.js'
import { assignPhotoCategories, attachCovers } from './photoSpots.js'
import { importBoundaries } from './sources/boundaries.js'
import { importCurated } from './sources/curated.js'
import { importTransitStops } from './sources/idfm.js'
import { importMuseofile } from './sources/museofile.js'
import { importOsmPois } from './sources/osm.js'
import { importWikidata } from './sources/wikidata.js'

const here = path.dirname(fileURLToPath(import.meta.url))

// Arbitrary but fixed: every import process competes for this Postgres advisory lock, so two runs
// (manual + scheduled, or two schedulers) can never write at the same time.
export const IMPORT_LOCK_KEY = 7_201_026

export const EXIT_OK = 0
export const EXIT_FAILED = 1
export const EXIT_LOCKED = 2

export type RunStatus = 'success' | 'failed' | 'aborted' | 'skipped_locked'
export type RunStats = Partial<Record<SourceKey, SourceStats>> & Record<string, unknown>
export type RunResult = { runId: string; status: RunStatus; exitCode: number; stats: RunStats; error: string | null }

// Uses (and leaves open) the given client: the caller owns the connection.
export async function runImport(client: pg.ClientBase, ctx: ImportContext): Promise<RunResult> {
  // Run bookkeeping happens outside the import transaction so failures are recorded too.
  const { rows: runRows } = await client.query<{ id: string }>(
    `INSERT INTO import_runs (refresh) VALUES ($1) RETURNING id`,
    [ctx.refresh],
  )
  const runId = runRows[0]?.id ?? ''
  const finish = async (status: RunStatus, exitCode: number, stats: RunStats, error: string | null = null) => {
    await client.query(`UPDATE import_runs SET status = $2, stats = $3, error = $4, finished_at = NOW() WHERE id = $1`, [
      runId,
      status,
      JSON.stringify(stats),
      error,
    ])
    return { runId, status, exitCode, stats, error }
  }

  const { rows: lockRows } = await client.query<{ locked: boolean }>(`SELECT pg_try_advisory_lock($1) AS locked`, [
    IMPORT_LOCK_KEY,
  ])
  if (!lockRows[0]?.locked) {
    ctx.log('✗ Another import is already running (advisory lock held). Nothing was changed.')
    return finish('skipped_locked', EXIT_LOCKED, {})
  }

  const stats: RunStats = {}
  const step = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    ctx.log(`▶ ${label}`)
    const result = await fn()
    ctx.log(`  ✓ ${JSON.stringify(result)}`)
    return result
  }

  try {
    // One transaction for the whole import: an abort or crash at any step leaves the previous data untouched.
    await client.query('BEGIN')

    // Seed rows (Tour Eiffel, Louvre…) would duplicate the real imported ones. Seeds stay for tests/E2E only.
    stats.seed_removed = await step('remove seed data', async () => {
      const pois = await client.query(`DELETE FROM pois WHERE source = 'seed'`)
      const stops = await client.query(`DELETE FROM transit_stops WHERE gtfs_stop_id LIKE 'seed:%'`)
      return { pois: pois.rowCount ?? 0, stops: stops.rowCount ?? 0 }
    })
    stats.regions = await step('regions (arrondissements + départements)', () => importBoundaries(client, ctx))
    stats.transit_stops = await step('transit stops (IDFM métro/RER/train/tram/câble)', () =>
      importTransitStops(client, ctx),
    )
    stats.osm = await step('POIs from OpenStreetMap', () => importOsmPois(client, ctx))
    stats.museofile = await step('museums from Muséofile', () => importMuseofile(client, ctx))
    stats.curated = await step('curated photo spots (curated/photo-spots.json)', () => importCurated(client, ctx))
    const wikidata = await step('Wikidata popularity, labels, images', () => importWikidata(client, ctx))
    stats.wikidata = wikidata.stats
    await step('derived fields (nearest station, Navigo zone, walk minutes)', async () => {
      await client.query(await readFile(path.join(here, 'postprocess.sql'), 'utf8'))
      return 'ok'
    })
    stats.photo_categories = await step('photo spot selection (photoSpots.ts)', () => assignPhotoCategories(client))
    stats.covers = await step('cover photos from Wikimedia Commons', () => attachCovers(client, ctx, wikidata.info))
    // osm.ts already assigns day_trip before writing; this step only catches rows from other sources and
    // reports curated QIDs that no longer exist in the data (renamed/removed in OSM).
    stats.day_trips = await step('curated day trips check (day-trips.ts)', async () => {
      const qids = Object.keys(DAY_TRIP_WIKIDATA)
      const fixed = await client.query(
        `UPDATE pois SET category = 'day_trip'
         WHERE deleted_at IS NULL AND wikidata = ANY($1) AND category <> 'day_trip'`,
        [qids],
      )
      const { rows } = await client.query<{ wikidata: string }>(
        `SELECT DISTINCT wikidata FROM pois WHERE deleted_at IS NULL AND wikidata = ANY($1)`,
        [qids],
      )
      const found = new Set(rows.map((r) => r.wikidata))
      const missing = qids.filter((q) => !found.has(q)).map((q) => `${q} ${DAY_TRIP_WIKIDATA[q]}`)
      return { fixed: fixed.rowCount ?? 0, found: found.size, missing }
    })

    await client.query('COMMIT')
    return finish('success', EXIT_OK, stats)
  } catch (err) {
    await client.query('ROLLBACK')
    const aborted = err instanceof ImportAbortError
    const message = err instanceof Error ? err.message : String(err)
    const status: RunStatus = aborted ? 'aborted' : 'failed'
    ctx.log(`✗ Import ${status} — all changes rolled back, database unchanged.\n  ${message}`)
    // An unexpected crash needs the stack to debug; a guard abort is self-explanatory.
    if (!aborted && err instanceof Error && err.stack) ctx.log(err.stack)
    return finish(status, EXIT_FAILED, stats, message)
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1)`, [IMPORT_LOCK_KEY])
  }
}
