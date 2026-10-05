// Read-only review of the photo-spot selection: count per category + top N by popularity.
// Usage: npm run import:report -w backend [-- --top 15]   (use it after changing MIN_SITELINKS in photoSpots.ts)
import pg from 'pg'
import { MIN_SITELINKS } from './photoSpots.js'

const DEFAULT_TOP = 15

async function main() {
  const topArg = process.argv.indexOf('--top')
  const top = topArg >= 0 ? Number(process.argv[topArg + 1]) || DEFAULT_TOP : DEFAULT_TOP
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    console.log('Thresholds (min Wikipedia sitelinks):', MIN_SITELINKS)
    const { rows: counts } = await client.query<{ photo_category: string; n: string; with_cover: string }>(
      `SELECT photo_category, count(*) AS n, count(cover_photo_url) AS with_cover
       FROM pois WHERE deleted_at IS NULL AND photo_category IS NOT NULL
       GROUP BY photo_category ORDER BY n DESC`,
    )
    console.table(counts.map((r) => ({ category: r.photo_category, spots: Number(r.n), with_cover: Number(r.with_cover) })))

    for (const { photo_category: cat } of counts) {
      const { rows } = await client.query<{ name: string; vi: string | null; popularity: number | null; curated: boolean }>(
        `SELECT name, name_i18n->>'vi' AS vi, popularity,
                EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'curated:%') AS curated
         FROM pois WHERE deleted_at IS NULL AND photo_category = $1
         ORDER BY curated DESC, popularity DESC NULLS LAST LIMIT $2`,
        [cat, top],
      )
      console.log(`\n── ${cat}`)
      console.table(rows.map((r) => ({ name: r.name, vi: r.vi ?? '', popularity: r.popularity, curated: r.curated ? '★' : '' })))
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
