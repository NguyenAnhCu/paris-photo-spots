// CLI entry for the open-data import. Logic lives in runImport.ts (testable); this file only wires argv/env/exit.
// Usage: npm run import -w backend [-- --refresh] [-- --allow-shrink]
//   --refresh       re-download instead of using the cache (IMPORT_CACHE_DIR, default db/import/.cache)
//   --allow-shrink  accept a source that shrank > 20% since the last successful run (see guards.ts)
// Exit codes: 0 success · 1 failed/aborted (DB unchanged) · 2 another import is already running.
import pg from 'pg'
import { contextFromCli } from './context.js'
import { EXIT_FAILED, EXIT_OK, runImport } from './runImport.js'

async function main(): Promise<number> {
  const ctx = contextFromCli(process.argv, process.env)
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    const result = await runImport(client, ctx)
    if (result.exitCode !== EXIT_OK) return result.exitCode

    console.log('\nChanges by source:')
    console.table(
      (['regions', 'transit_stops', 'osm', 'museofile', 'curated', 'wikidata', 'covers'] as const).map((k) => ({
        source: k,
        ...result.stats[k],
      })),
    )
    const { rows } = await client.query<{ category: string; n: string }>(
      `SELECT category, count(*) AS n FROM pois WHERE deleted_at IS NULL GROUP BY category ORDER BY n DESC`,
    )
    console.log('Live POIs by category:')
    console.table(rows.map((r) => ({ category: r.category, count: Number(r.n) })))
    return EXIT_OK
  } finally {
    await client.end()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err)
    process.exit(EXIT_FAILED)
  })
