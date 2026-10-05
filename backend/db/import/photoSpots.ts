// Decides which POIs are shown in the app (pois.photo_category) and attaches cover photos.
// Single writer of: photo_category, crowd_level, best_time, tip (curated), name_i18n.vi (curated), cover_photo_*.
import { createHash } from 'node:crypto'
import type pg from 'pg'
import { fetchJsonCached } from './cache.js'
import type { ImportContext } from './context.js'
import { newStats, type SourceStats } from './guards.js'
import { curatedTag, loadCuratedSpots } from './sources/curated.js'
import type { WikidataInfo } from './sources/wikidata.js'

// "High tourism value" = minimum number of Wikipedia language editions (Wikidata sitelinks) per photo category.
// Calibrated on 2026-10-05 against the IDF dataset ("medium" option chosen by the user, ≈ 270 spots) —
// review with `npm run import:report -w backend`.
export const MIN_SITELINKS = {
  landmark: 10,
  street: 5,
  skyline: 4,
  bridge: 4,
  park: 6,
  suburb: 12,
} as const

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
const COVER_WIDTH = 1280
const COMMONS_BATCH = 50

export async function assignPhotoCategories(client: pg.ClientBase): Promise<SourceStats> {
  const t = MIN_SITELINKS
  // Rules top-down: outside Paris → suburb; then by internal category. Curated rows are
  // set from the curated file below; user-created spots ('user') keep the category they chose.
  // One spot per Wikidata item: the same place can come as several OSM objects of different kinds
  // (Champs-Élysées as street + attraction node, Coulée verte as park + footway). Ranking happens in the same
  // statement (curated first, then most specific category, then oldest row) so a re-run computes the same result
  // and leaves rows untouched — a separate "select then de-duplicate" pass would flip them on every run.
  const { rowCount } = await client.query(
    `WITH paris AS (SELECT geom FROM regions WHERE code = '75' AND deleted_at IS NULL LIMIT 1),
     computed AS (
       SELECT p.id, p.wikidata, p.created_at,
         EXISTS (SELECT 1 FROM unnest(p.tags) tg WHERE tg LIKE 'curated:%') AS curated,
         CASE
           WHEN p.popularity IS NULL THEN NULL
           WHEN NOT ST_Intersects(p.geom, (SELECT geom FROM paris)) THEN
             CASE WHEN p.category IN ('monument','museum','church_religious','day_trip','experience','park_garden','bridge','viewpoint','tower','street')
                   AND p.popularity >= $6 THEN 'suburb' END
           WHEN p.category = 'bridge' THEN CASE WHEN p.popularity >= $4 THEN 'bridge' END
           WHEN p.category IN ('viewpoint', 'tower') THEN CASE WHEN p.popularity >= $3 THEN 'skyline' END
           WHEN p.category = 'street' THEN CASE WHEN p.popularity >= $2 THEN 'street' END
           WHEN p.category = 'park_garden' THEN CASE WHEN p.popularity >= $5 THEN 'park' END
           WHEN p.category IN ('monument','museum','church_religious','day_trip','experience') THEN
             CASE WHEN p.popularity >= $1 THEN 'landmark' END
         END AS cat
       FROM pois p
       WHERE p.deleted_at IS NULL AND p.source IN ('osm', 'museofile', 'curated')
     ),
     ranked AS (
       SELECT id, curated, cat,
         CASE WHEN wikidata IS NULL OR NOT (curated OR cat IS NOT NULL) THEN 1
              ELSE row_number() OVER (
                PARTITION BY wikidata, (curated OR cat IS NOT NULL)
                ORDER BY curated DESC,
                         array_position(ARRAY['bridge','street','skyline','park','landmark','suburb'], cat),
                         created_at, id)
         END AS rk
       FROM computed
     )
     UPDATE pois SET photo_category = CASE WHEN r.rk = 1 THEN r.cat END
     FROM ranked r
     WHERE pois.id = r.id AND NOT r.curated
       AND pois.photo_category IS DISTINCT FROM (CASE WHEN r.rk = 1 THEN r.cat END)`,
    [t.landmark, t.street, t.skyline, t.bridge, t.park, t.suburb],
  )
  const stats = newStats(0)
  stats.updated = rowCount ?? 0

  for (const spot of await loadCuratedSpots()) {
    const res = await client.query(
      `UPDATE pois
       SET photo_category = $2, crowd_level = $3, best_time = $4, tip = $5,
           name_i18n = name_i18n || jsonb_build_object('vi', $6::text)
       WHERE deleted_at IS NULL AND $1 = ANY(tags)
         AND (photo_category, crowd_level, best_time, tip, name_i18n->>'vi')
             IS DISTINCT FROM ($2, $3::smallint, $4, $5, $6::text)`,
      [curatedTag(spot), spot.category, spot.crowdLevel, spot.bestTime, spot.tip, spot.name],
    )
    stats.updated += res.rowCount ?? 0
  }
  const { rows } = await client.query<{ n: string }>(
    `SELECT count(*) AS n FROM pois WHERE deleted_at IS NULL AND photo_category IS NOT NULL`,
  )
  stats.fetched = Number(rows[0]?.n ?? 0)
  return stats
}

type ImageInfo = {
  thumburl?: string
  descriptionurl?: string
  extmetadata?: Record<string, { value?: string } | undefined>
}
type CommonsResponse = {
  query?: {
    normalized?: { from: string; to: string }[]
    pages?: Record<string, { title: string; missing?: string; imageinfo?: ImageInfo[] }>
  }
}

// Artist comes as HTML (<a href=…>Name</a>); keep plain text only.
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Some Commons "Artist" fields hold a whole paragraph of reuse instructions (seen: 750 characters). The credit line
// links to the file page, which keeps the full text, so a short author name is enough here.
const MAX_ARTIST_LENGTH = 80

export function shortenArtist(artist: string, max = MAX_ARTIST_LENGTH): string {
  if (artist.length <= max) return artist
  const cut = artist.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.(-]+$/, '')}…`
}

export function toAttribution(info: ImageInfo): string {
  const artist = shortenArtist(stripHtml(info.extmetadata?.Artist?.value ?? '')) || 'Unknown author'
  const license = stripHtml(info.extmetadata?.LicenseShortName?.value ?? '') || 'see source'
  return `${artist} · ${license} · Wikimedia Commons`
}

// Cover photos only for spots that are shown: fetching attribution for ~2,000 POIs would be wasted requests.
export async function attachCovers(
  client: pg.ClientBase,
  ctx: ImportContext,
  wikidata: Map<string, WikidataInfo>,
): Promise<SourceStats> {
  // popularity IS NOT NULL ⇔ the QID was trusted (its coordinates match the POI, see wikidata.ts); an untrusted
  // QID's image shows something else (a person, an event). Covers left over from earlier runs are cleared.
  const cleared = await client.query(
    `UPDATE pois SET cover_photo_url = NULL, cover_photo_page_url = NULL, cover_photo_attribution = NULL
     WHERE cover_photo_url IS NOT NULL AND (photo_category IS NULL OR popularity IS NULL OR deleted_at IS NOT NULL)`,
  )
  const { rows } = await client.query<{ wikidata: string }>(
    `SELECT DISTINCT wikidata FROM pois
     WHERE deleted_at IS NULL AND photo_category IS NOT NULL AND popularity IS NOT NULL AND wikidata IS NOT NULL
     ORDER BY wikidata`,
  )
  const files = new Map<string, string>() // "File:Name.jpg" → qid
  for (const { wikidata: qid } of rows) {
    const file = wikidata.get(qid)?.imageFile
    if (file) files.set(`File:${file}`, qid)
  }

  const titles = [...files.keys()]
  const stats = newStats(titles.length)
  stats.softDeleted = cleared.rowCount ?? 0 // reported as "cleared covers"
  for (let i = 0; i < titles.length; i += COMMONS_BATCH) {
    const batch = titles.slice(i, i + COMMONS_BATCH)
    const body = new URLSearchParams({
      action: 'query',
      format: 'json',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: String(COVER_WIDTH),
      iiextmetadatafilter: 'Artist|LicenseShortName',
      titles: batch.join('|'),
    }).toString()
    const hash = createHash('sha1').update(body).digest('hex').slice(0, 10)
    const data = await fetchJsonCached<CommonsResponse>(ctx, `commons-${hash}.json`, COMMONS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    // Commons normalizes titles (underscores → spaces…): map the returned title back to what we asked for.
    const requestedBy = new Map<string, string>()
    for (const t of batch) requestedBy.set(t, t)
    for (const n of data.query?.normalized ?? []) requestedBy.set(n.to, n.from)

    for (const page of Object.values(data.query?.pages ?? {})) {
      const info = page.imageinfo?.[0]
      const qid = files.get(requestedBy.get(page.title) ?? page.title)
      if (!info?.thumburl || !qid) continue
      const url = info.thumburl.split('?')[0] ?? info.thumburl // drop tracking query params
      const res = await client.query(
        `UPDATE pois SET cover_photo_url = $2, cover_photo_page_url = $3, cover_photo_attribution = $4
         WHERE deleted_at IS NULL AND wikidata = $1 AND photo_category IS NOT NULL AND popularity IS NOT NULL
           AND (cover_photo_url, cover_photo_page_url, cover_photo_attribution) IS DISTINCT FROM ($2, $3, $4)`,
        [qid, url, info.descriptionurl ?? null, toAttribution(info)],
      )
      if ((res.rowCount ?? 0) > 0) stats.updated += res.rowCount ?? 0
      else stats.unchanged++
    }
  }
  return stats
}
