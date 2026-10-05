import { createHash } from 'node:crypto'
import type pg from 'pg'
import type { ImportContext } from '../context.js'
import { haversineMeters, type LngLat } from '../../../src/lib/geo.js'
import { fetchJsonCached } from '../cache.js'
import { DAY_TRIP_WIKIDATA } from '../day-trips.js'
import { assertNoShrink, assertNonEmpty, count, ImportAbortError, newStats, type SourceStats } from '../guards.js'
import { normalizeName } from '../names.js'
import { softDeleteMissing, upsertPoi, type ImportedPoi } from './poiUpsert.js'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
// OSM often maps one place several times (building, visitor attraction, museum): 3× "Château de Versailles".
const DUPLICATE_RADIUS_M = 500

// Quality filter: galleries, memorials and parks are only kept when they have a Wikidata entry. Without it,
// ~600 commercial art galleries, thousands of plaques and pocket squares drown the real attractions.
// Bridges, streets and towers (photo categories bridge / street / skyline) are only fetched with a Wikidata entry:
// that is what makes them notable, and popularity (Wikipedia sitelinks) is read from it later.
const OVERPASS_QUERY = `
[out:json][timeout:240];
area["ISO3166-2"="FR-IDF"]->.idf;
(
  nwr["tourism"~"^(attraction|museum|viewpoint|zoo|theme_park|aquarium)$"]["name"](area.idf);
  nwr["tourism"="gallery"]["name"]["wikidata"](area.idf);
  nwr["historic"~"^(castle|palace|monument|church)$"]["name"](area.idf);
  nwr["historic"="memorial"]["name"]["wikidata"](area.idf);
  nwr["leisure"~"^(park|garden)$"]["name"]["wikidata"](area.idf);
  nwr["amenity"="marketplace"]["name"](area.idf);
  nwr["man_made"="bridge"]["name"]["wikidata"](area.idf);
  way["bridge"]["name"]["wikidata"](area.idf);
  way["highway"~"^(pedestrian|residential|living_street|footway|steps|unclassified|tertiary|secondary|primary)$"]["name"]["wikidata"](area.idf);
  nwr["man_made"="tower"]["name"]["wikidata"](area.idf);
);
out center tags;
`

type OsmElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

const TAG_KEYS = ['tourism', 'historic', 'leisure', 'amenity', 'man_made', 'bridge', 'highway'] as const

const isBridge = (tags: Record<string, string>) => tags.man_made === 'bridge' || (tags.bridge !== undefined && tags.bridge !== 'no')

// Order matters: an element often has several tags (Sacré-Cœur is tourism=attraction + amenity=place_of_worship),
// the most specific meaning wins. Day trips come from the curated list in day-trips.ts (applied after dedupe).
// This is the internal tourism category; the displayed photo category is derived later (photoSpots.ts).
export function osmCategory(tags: Record<string, string>): string {
  const { tourism, historic, leisure, amenity, man_made, highway } = tags
  if (tourism === 'museum' || tourism === 'gallery') return 'museum'
  if (tourism === 'viewpoint') return 'viewpoint'
  if (tourism === 'zoo' || tourism === 'aquarium' || tourism === 'theme_park') return 'experience'
  if (historic === 'church' || amenity === 'place_of_worship') return 'church_religious'
  if (leisure === 'park' || leisure === 'garden') return 'park_garden'
  if (amenity === 'marketplace') return 'market_food'
  if (isBridge(tags)) return 'bridge'
  if (man_made === 'tower') return 'tower'
  if (highway) return 'street'
  return 'monument'
}

// Inverse of the `key:value` tag strings stored in pois.tags (first value per key wins).
export function tagsToRecord(tags: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const t of tags) {
    const i = t.indexOf(':')
    if (i <= 0) continue
    const key = t.slice(0, i)
    if (!(key in out)) out[key] = t.slice(i + 1)
  }
  return out
}

// Streets and bridges are drawn as many way segments sharing one Wikidata item (Champs-Élysées ≈ 20 segments over 2 km),
// so they are grouped by QID. Point-like places keep name grouping: one QID can tag several distinct objects there
// (5 "Crue 1910" flood markers across Paris).
function dedupeKey(p: ImportedPoi): string {
  const linear = p.tags.some((t) => t.startsWith('highway:') || t.startsWith('bridge:') || t === 'man_made:bridge')
  return linear && p.wikidata ? `qid:${p.wikidata}` : `name:${normalizeName(p.name)}`
}

export function toPoi(el: OsmElement): ImportedPoi | null {
  const tags = el.tags ?? {}
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (!tags.name || lat === undefined || lng === undefined) return null
  return {
    source: 'osm',
    sourceRef: `${el.type}/${el.id}`,
    name: tags.name,
    category: osmCategory(tags),
    lng,
    lat,
    tags: TAG_KEYS.filter((k) => tags[k]).map((k) => `${k}:${tags[k]}`),
    description: tags.description ?? null,
    website: tags.website ?? tags['contact:website'] ?? null,
    openingHours: tags.opening_hours ?? null,
    wikidata: tags.wikidata ?? null,
  }
}

// Prefer the representation a visitor would recognise: has Wikidata, is tagged as a tourism feature.
function score(p: ImportedPoi): number {
  return (p.wikidata ? 4 : 0) + (p.tags.some((t) => t.startsWith('tourism:')) ? 2 : 0) + (p.sourceRef.startsWith('node/') ? 0 : 1)
}

// Collapses duplicates into the best-scored POI, merging their tags and details: same name within
// DUPLICATE_RADIUS_M, or (streets/bridges) same Wikidata item regardless of distance.
// Done before writing so re-imports stay idempotent (the dropped refs are soft-deleted, never re-inserted).
export function dedupeByName(pois: ImportedPoi[]): ImportedPoi[] {
  const groups = new Map<string, ImportedPoi[]>()
  for (const p of pois) {
    const key = dedupeKey(p)
    groups.set(key, [...(groups.get(key) ?? []), p])
  }
  const result: ImportedPoi[] = []
  for (const [key, group] of groups) {
    const byQid = key.startsWith('qid:')
    const remaining = [...group].sort((a, b) => score(b) - score(a))
    while (remaining.length > 0) {
      const [best, ...rest] = remaining
      if (!best) break
      const at: LngLat = [best.lng, best.lat]
      const dupes = byQid ? rest : rest.filter((p) => haversineMeters(at, [p.lng, p.lat]) <= DUPLICATE_RADIUS_M)
      const tags = [...new Set([best, ...dupes].flatMap((p) => p.tags))]
      const merged: ImportedPoi = {
        ...best,
        // Street/bridge segments: the best-scored segment may lack the `bridge` tag another segment has
        // (Pont Notre-Dame came out as "street"), so the category is recomputed from all merged tags.
        category: byQid ? osmCategory(tagsToRecord(tags)) : best.category,
        tags,
        wikidata: best.wikidata ?? dupes.find((p) => p.wikidata)?.wikidata ?? null,
        website: best.website ?? dupes.find((p) => p.website)?.website ?? null,
        openingHours: best.openingHours ?? dupes.find((p) => p.openingHours)?.openingHours ?? null,
        description: best.description ?? dupes.find((p) => p.description)?.description ?? null,
      }
      result.push(merged)
      remaining.splice(0, remaining.length, ...rest.filter((p) => !dupes.includes(p)))
    }
  }
  return result
}

export async function importOsmPois(client: pg.ClientBase, ctx: ImportContext): Promise<SourceStats> {
  // Query hash in the cache name: editing the query automatically triggers a fresh download.
  const queryHash = createHash('sha1').update(OVERPASS_QUERY).digest('hex').slice(0, 8)
  const data = await fetchJsonCached<{ elements: OsmElement[]; remark?: string }>(
    ctx,
    `osm-idf-tourism-${queryHash}.json`,
    OVERPASS_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: OVERPASS_QUERY }).toString(),
    },
    validateOverpass,
  )

  const fetched = data.elements.map(toPoi).filter((p): p is ImportedPoi => p !== null)
  await assertNoShrink(client, ctx, 'osm', fetched.length)
  // Day trip is decided here, before writing, so the upsert stores the final category and a re-run sees
  // "unchanged" rather than flip-flopping monument → day_trip. Must follow dedupe (it may merge in the QID).
  const pois = dedupeByName(fetched).map((p) =>
    p.wikidata && p.wikidata in DAY_TRIP_WIKIDATA ? { ...p, category: 'day_trip' } : p,
  )

  const stats = newStats(fetched.length)
  for (const poi of pois) count(stats, await upsertPoi(client, poi))
  stats.softDeleted = await softDeleteMissing(
    client,
    'osm',
    pois.map((p) => p.sourceRef),
  )
  return stats
}

// Overpass reports timeouts / memory exhaustion with HTTP 200, a `remark` and a *partial* element list.
// Treating that as the full dataset would soft-delete everything that happened to be cut off.
export function validateOverpass(data: { elements?: unknown; remark?: string }) {
  if (data.remark) throw new ImportAbortError(`Overpass returned an incomplete result: ${data.remark}`)
  assertNonEmpty('overpass', Array.isArray(data.elements) ? data.elements.length : 0)
}
