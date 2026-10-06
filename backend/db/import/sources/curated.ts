import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'
import type { ImportContext } from '../context.js'
import { count, newStats, type SourceStats } from '../guards.js'
import { similarNames } from '../names.js'
import { softDeleteMissing, upsertPoi } from './poiUpsert.js'

const CURATED_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'curated', 'photo-spots.json')
// Same reasoning as Muséofile: the designer's pin and the OSM pin of a place can be a few hundred metres apart.
const MATCH_RADIUS_M = 300

export const PHOTO_CATEGORIES = [
  'landmark',
  'street',
  'skyline',
  'bridge',
  'park',
  'rooftop',
  'wedding',
  'suburb',
] as const
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number]
export const BEST_TIMES = ['sunrise', 'early_morning', 'midday', 'late_afternoon', 'sunset'] as const

export type CuratedSpot = {
  id: string
  name: string
  matchName?: string
  category: PhotoCategory
  lat: number
  lng: number
  crowdLevel: 1 | 2 | 3
  bestTime: (typeof BEST_TIMES)[number]
  tip: string
}

// Internal tourism category for curated spots that exist in no other source (Rooftop Printemps, Giverny…).
const INTERNAL_CATEGORY: Record<PhotoCategory, string> = {
  landmark: 'monument',
  street: 'street',
  skyline: 'viewpoint',
  bridge: 'bridge',
  park: 'park_garden',
  rooftop: 'viewpoint',
  wedding: 'monument',
  suburb: 'monument',
}

export const curatedTag = (spot: CuratedSpot) => `curated:${spot.id}`

export async function loadCuratedSpots(): Promise<CuratedSpot[]> {
  const data = JSON.parse(await readFile(CURATED_FILE, 'utf8')) as { spots: CuratedSpot[] }
  for (const s of data.spots) {
    if (!PHOTO_CATEGORIES.includes(s.category)) throw new Error(`curated ${s.id}: unknown category ${s.category}`)
    if (!BEST_TIMES.includes(s.bestTime)) throw new Error(`curated ${s.id}: unknown bestTime ${s.bestTime}`)
  }
  return data.spots
}

// Links each curated spot to an existing POI (tag `curated:<id>`) so it reuses OSM data, Wikidata popularity and cover
// photo; inserts the spot itself (source 'curated') only when nothing matches. Photo fields (category, crowd, best time,
// tip) are applied later by photoSpots.ts — the single writer of those columns.
export async function importCurated(client: pg.ClientBase, _ctx: ImportContext): Promise<SourceStats> {
  const spots = await loadCuratedSpots()
  const stats: SourceStats = { ...newStats(spots.length), matched: 0 }
  const insertedRefs: string[] = []

  for (const spot of spots) {
    const tag = curatedTag(spot)
    const { rows: candidates } = await client.query<{
      id: string
      name: string
      has_wikidata: boolean
      distance_m: number
    }>(
      `SELECT id, name, wikidata IS NOT NULL AS has_wikidata,
              ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_m
       FROM pois
       WHERE deleted_at IS NULL AND source IN ('osm', 'museofile')
         AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
       ORDER BY has_wikidata DESC, distance_m`,
      [spot.lng, spot.lat, MATCH_RADIUS_M],
    )
    const names = [spot.name, spot.matchName].filter((n): n is string => Boolean(n))
    const match = candidates.find((c) => names.some((n) => similarNames(c.name, n)))

    // A spot can move to a better match between runs: drop its tag from any other row first. The row that keeps
    // the tag is the match, or — when nothing matches — the spot's own 'curated' row (excluding it explicitly:
    // `id IS DISTINCT FROM NULL` would otherwise strip the tag from that row on every run).
    await client.query(
      `UPDATE pois SET tags = array_remove(tags, $1)
       WHERE $1 = ANY(tags)
         AND CASE WHEN $2::uuid IS NOT NULL THEN id <> $2::uuid
                  ELSE NOT (source = 'curated' AND source_ref = $3) END`,
      [tag, match?.id ?? null, spot.id],
    )

    if (match) {
      await client.query(`UPDATE pois SET tags = array_append(tags, $2) WHERE id = $1 AND NOT ($2 = ANY(tags))`, [
        match.id,
        tag,
      ])
      stats.matched = (stats.matched ?? 0) + 1
      continue
    }
    count(
      stats,
      await upsertPoi(client, {
        source: 'curated',
        sourceRef: spot.id,
        name: spot.name,
        category: INTERNAL_CATEGORY[spot.category],
        lng: spot.lng,
        lat: spot.lat,
        tags: [tag],
      }),
    )
    insertedRefs.push(spot.id)
  }
  stats.softDeleted = await softDeleteMissing(client, 'curated', insertedRefs)
  return stats
}
