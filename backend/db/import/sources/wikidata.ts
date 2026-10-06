import { createHash } from 'node:crypto'
import type pg from 'pg'
import { fetchJsonCached } from '../cache.js'
import type { ImportContext } from '../context.js'
import { assertNoShrink, assertNonEmpty, newStats, type SourceStats } from '../guards.js'

const SPARQL_URL = 'https://query.wikidata.org/sparql'
// WDQS handles a few hundred VALUES per query comfortably; smaller batches also mean smaller cache invalidations.
const BATCH_SIZE = 250
const LANGS = ['vi', 'en', 'fr'] as const

type Binding = Record<string, { value: string } | undefined>
type SparqlResult = { results: { bindings: Binding[] } }

// OSM `wikidata` tags sometimes point at the *subject* of an object rather than the object itself
// (a square tagged with the singer it is named after, a memorial tagged with the air crash). Such items have no
// coordinates (people, events, concepts) or coordinates elsewhere, and would inflate popularity and give wrong names.
// The QID is trusted only when its P625 lies within this distance of the POI. Large parks/forests need the margin
// (Bois de Boulogne: Wikidata point vs OSM centroid ≈ 1–2 km).
export const MAX_QID_DISTANCE_M = 3000

export type WikidataInfo = {
  sitelinks: number
  imageFile: string | null
  coord: [lng: number, lat: number] | null
  labels: Partial<Record<(typeof LANGS)[number], string>>
}

function buildQuery(qids: string[]): string {
  const labels = LANGS.map((l) => `OPTIONAL { ?item rdfs:label ?${l} FILTER(LANG(?${l}) = "${l}") }`).join('\n  ')
  return `SELECT ?item ?sitelinks ?image ?coord ${LANGS.map((l) => `?${l}`).join(' ')} WHERE {
  VALUES ?item { ${qids.map((q) => `wd:${q}`).join(' ')} }
  ?item wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P625 ?coord }
  ${labels}
}`
}

// WKT literal "Point(2.2945 48.8584)" → [lng, lat] (WKT order is already lng lat).
export function parseWktPoint(wkt: string): [number, number] | null {
  const m = wkt.match(/Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
  if (!m?.[1] || !m[2]) return null
  const lng = Number(m[1])
  const lat = Number(m[2])
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
}

// P18 values are URLs like http://commons.wikimedia.org/wiki/Special:FilePath/Tour%20Eiffel.jpg → "Tour Eiffel.jpg".
export function commonsFileName(imageUrl: string): string {
  return decodeURIComponent(imageUrl.split('/Special:FilePath/')[1] ?? '')
}

// One item can come back on several rows (several P18 images / labels): keep the first value of each.
export function parseSparql(bindings: Binding[]): Map<string, WikidataInfo> {
  const out = new Map<string, WikidataInfo>()
  for (const b of bindings) {
    const qid = b.item?.value.split('/').pop()
    if (!qid) continue
    const info = out.get(qid) ?? {
      sitelinks: Number(b.sitelinks?.value ?? 0),
      imageFile: null,
      coord: null,
      labels: {},
    }
    if (!info.imageFile && b.image?.value) info.imageFile = commonsFileName(b.image.value) || null
    if (!info.coord && b.coord?.value) info.coord = parseWktPoint(b.coord.value)
    for (const l of LANGS) {
      const label = b[l]?.value
      if (label && !info.labels[l]) info.labels[l] = label
    }
    out.set(qid, info)
  }
  return out
}

const isQid = (q: string) => /^Q\d+$/.test(q)

// Reads popularity (number of Wikipedia language editions), vi/en/fr labels and the P18 image for every live POI
// that has a Wikidata id. Returns the image map so the cover step can resolve attribution for the selected spots only.
export async function importWikidata(
  client: pg.ClientBase,
  ctx: ImportContext,
): Promise<{ stats: SourceStats; info: Map<string, WikidataInfo> }> {
  const { rows } = await client.query<{ wikidata: string }>(
    `SELECT DISTINCT wikidata FROM pois WHERE deleted_at IS NULL AND wikidata IS NOT NULL ORDER BY wikidata`,
  )
  const qids = rows.map((r) => r.wikidata).filter(isQid)

  const info = new Map<string, WikidataInfo>()
  for (let i = 0; i < qids.length; i += BATCH_SIZE) {
    const batch = qids.slice(i, i + BATCH_SIZE)
    const query = buildQuery(batch)
    const hash = createHash('sha1').update(query).digest('hex').slice(0, 10)
    const data = await fetchJsonCached<SparqlResult>(
      ctx,
      `wikidata-${hash}.json`,
      SPARQL_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/sparql-results+json',
        },
        body: new URLSearchParams({ query }).toString(),
      },
      (d) => assertNonEmpty('wikidata', d.results?.bindings?.length ?? 0),
    )
    for (const [qid, value] of parseSparql(data.results.bindings)) info.set(qid, value)
  }
  await assertNoShrink(client, ctx, 'wikidata', info.size)

  const stats = newStats(info.size)
  for (const [qid, value] of info) {
    // Curated spots keep their designer-written Vietnamese name (photoSpots.ts sets it); Wikidata fills the rest.
    // `trusted` = the QID's own coordinates are near this POI (see MAX_QID_DISTANCE_M); otherwise popularity and
    // labels are cleared. `keep_vi` = curated row that already has its Vietnamese name: merge/compare without 'vi'.
    const { rowCount } = await client.query(
      `WITH target AS (
         SELECT id,
                (EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'curated:%') AND name_i18n ? 'vi') AS keep_vi,
                ($4::float8 IS NOT NULL AND ST_DWithin(
                   geom::geography, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6)) AS trusted
         FROM pois WHERE deleted_at IS NULL AND wikidata = $1
       ),
       next AS (
         SELECT id, keep_vi,
                CASE WHEN trusted THEN $2::int END AS popularity,
                CASE WHEN trusted THEN $3::jsonb ELSE '{}'::jsonb END AS labels
         FROM target
       )
       UPDATE pois p
       SET popularity = n.popularity,
           name_i18n = CASE WHEN n.keep_vi THEN n.labels || jsonb_build_object('vi', p.name_i18n->>'vi') ELSE n.labels END
       FROM next n
       WHERE p.id = n.id
         AND (p.popularity IS DISTINCT FROM n.popularity
              OR (CASE WHEN n.keep_vi THEN p.name_i18n - 'vi' ELSE p.name_i18n END)
                 IS DISTINCT FROM (CASE WHEN n.keep_vi THEN n.labels - 'vi' ELSE n.labels END))`,
      [
        qid,
        value.sitelinks,
        JSON.stringify(value.labels),
        value.coord?.[0] ?? null,
        value.coord?.[1] ?? null,
        MAX_QID_DISTANCE_M,
      ],
    )
    if ((rowCount ?? 0) > 0) stats.updated += rowCount ?? 0
    else stats.unchanged++
  }
  return { stats, info }
}
