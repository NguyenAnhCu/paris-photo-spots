import type pg from 'pg'
import type { ImportContext } from './context.js'

// A deliberate stop (bad or suspicious source data), recorded as status 'aborted' — distinct from a crash ('failed').
export class ImportAbortError extends Error {}

export type SourceKey = 'regions' | 'transit_stops' | 'osm' | 'museofile' | 'curated' | 'wikidata' | 'covers'

export type SourceStats = {
  fetched: number
  inserted: number
  updated: number
  unchanged: number
  softDeleted: number
  matched?: number
}

export type UpsertOutcome = 'inserted' | 'updated' | 'unchanged'

export function newStats(fetched: number): SourceStats {
  return { fetched, inserted: 0, updated: 0, unchanged: 0, softDeleted: 0 }
}

// Upserts use `DO UPDATE … WHERE (cols) IS DISTINCT FROM (EXCLUDED cols) RETURNING (xmax = 0) AS inserted`:
// no row back = identical data (unchanged); inserted = true/false otherwise. Keeps reports meaningful and
// avoids rewriting every row (and its updated_at) on each run.
export function upsertOutcome(rows: { inserted: boolean }[]): UpsertOutcome {
  const row = rows[0]
  if (!row) return 'unchanged'
  return row.inserted ? 'inserted' : 'updated'
}

export function count(stats: SourceStats, outcome: UpsertOutcome): void {
  stats[outcome]++
}

// A partial download (Overpass timeout, truncated export) looks like "thousands of POIs disappeared" and would
// soft-delete them. Below this share of the last successful download, the run aborts instead.
export const MIN_KEEP_RATIO = 0.8

export async function assertNoShrink(
  client: pg.ClientBase,
  ctx: ImportContext,
  source: SourceKey,
  fetched: number,
): Promise<void> {
  const { rows } = await client.query<{ prev: number | null }>(
    `SELECT (stats -> $1 ->> 'fetched')::int AS prev
     FROM import_runs
     WHERE status = 'success' AND deleted_at IS NULL AND stats ? $1
     ORDER BY started_at DESC
     LIMIT 1`,
    [source],
  )
  const prev = rows[0]?.prev
  if (!prev) return // first run for this source: nothing to compare with
  if (fetched >= prev * MIN_KEEP_RATIO) return
  const message = `${source}: downloaded ${fetched} records, last successful run had ${prev} (< ${MIN_KEEP_RATIO * 100}%)`
  if (ctx.allowShrink) {
    ctx.log(`  ⚠ ${message} — continuing because --allow-shrink was given`)
    return
  }
  throw new ImportAbortError(`${message}. Check the source, or re-run with --allow-shrink if the drop is real.`)
}

export function assertNonEmpty(source: string, count: number): void {
  if (count === 0) throw new ImportAbortError(`${source}: response contains no records`)
}
