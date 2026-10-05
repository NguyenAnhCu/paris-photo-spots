import type pg from 'pg'
import type { ImportContext } from '../context.js'
import { haversineMeters, type LngLat } from '../../../src/lib/geo.js'
import { fetchCached } from '../cache.js'
import { assertNoShrink, count, ImportAbortError, newStats, type SourceStats } from '../guards.js'
import { similarNames } from '../names.js'
import { softDeleteMissing, upsertPoi } from './poiUpsert.js'

const MUSEOFILE_URL = 'https://ministere-culture.s3.sbg.io.cloud.ovh.net/POP/museofile.csv'
// OSM pins a building's centroid, Muséofile its postal address: same museum measured 151–226 m apart
// (Musée de l'Armée, Musée d'Orsay). The name-similarity check keeps this radius from merging neighbours.
const MATCH_RADIUS_M = 300

type MuseofileRow = Record<string, string>

// Every value is wrapped in double quotes ("M1128"|"musée …"), with "" as an escaped quote.
export function unquote(value: string): string {
  const v = value.trim()
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/""/g, '"').trim() : v
}

// Pipe-delimited; checked 2026-10-02 that no quoted value contains '|' or a newline, so a plain split is safe
// and avoids a CSV dependency. Re-check if the row count stops matching the line count.
export function parsePipeCsv(text: string): MuseofileRow[] {
  const [header = '', ...lines] = text.replace(/^﻿/, '').split(/\r?\n/)
  const cols = header.split('|').map(unquote)
  return lines.filter((l) => l.trim()).map((l) => {
    const values = l.split('|')
    return Object.fromEntries(cols.map((c, i) => [c, unquote(values[i] ?? '')]))
  })
}

export function toWebsite(url: string): string | null {
  if (!url) return null
  return /^https?:\/\//.test(url) ? url : `https://${url}`
}

type OsmMuseum = { id: string; name: string; at: LngLat }

// The parser depends on these columns; an HTML error page or a renamed export must stop the run, not import nothing.
export function validateMuseofile(body: string) {
  const header = body.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''
  for (const col of ['Identifiant', 'Nom_officiel', 'Region', 'Coordonnees']) {
    if (!header.includes(col)) throw new ImportAbortError(`museofile.csv: missing column ${col} — export format changed?`)
  }
}

export async function importMuseofile(client: pg.ClientBase, ctx: ImportContext): Promise<SourceStats> {
  const rows = parsePipeCsv(await fetchCached(ctx, 'museofile.csv', MUSEOFILE_URL, {}, validateMuseofile)).filter((r) =>
    (r.Region ?? '').includes('le-de-France'),
  )
  await assertNoShrink(client, ctx, 'museofile', rows.length)

  const { rows: osmMuseums } = await client.query<{ id: string; name: string; lng: number; lat: number }>(
    `SELECT id, name, ST_X(geom) AS lng, ST_Y(geom) AS lat
     FROM pois
     WHERE source = 'osm' AND deleted_at IS NULL AND (category = 'museum' OR 'tourism:museum' = ANY(tags))`,
  )
  const candidates: OsmMuseum[] = osmMuseums.map((m) => ({ id: m.id, name: m.name, at: [m.lng, m.lat] }))

  const stats: SourceStats = { ...newStats(rows.length), matched: 0 }
  const insertedRefs: string[] = []
  for (const r of rows) {
    // Muséofile writes "lat, lng" — the opposite of the project's [lng, lat] convention.
    const [lat, lng] = (r.Coordonnees ?? '').split(',').map((v) => Number(v.trim()))
    if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const at: LngLat = [lng, lat]
    const name = r.Nom_officiel ? r.Nom_officiel.charAt(0).toUpperCase() + r.Nom_officiel.slice(1) : ''
    if (!name || !r.Identifiant) continue
    const website = toWebsite(r.URL ?? '')
    const description = r.Atout || null

    const match = candidates.find((c) => haversineMeters(c.at, at) <= MATCH_RADIUS_M && similarNames(c.name, name))
    if (match) {
      // Enrich the OSM row instead of creating a duplicate pin; OSM keeps ownership of name and position.
      // Only touches the row when it gains something, so unchanged re-runs do not rewrite it.
      await client.query(
        `UPDATE pois SET website = COALESCE(website, $2), description = COALESCE(description, $3),
                         tags = CASE WHEN $4 = ANY(tags) THEN tags ELSE array_append(tags, $4) END
         WHERE id = $1
           AND ((website IS NULL AND $2::text IS NOT NULL) OR (description IS NULL AND $3::text IS NOT NULL)
                OR NOT ($4 = ANY(tags)))`,
        [match.id, website, description, `museofile:${r.Identifiant}`],
      )
      stats.matched = (stats.matched ?? 0) + 1
      continue
    }
    const outcome = await upsertPoi(client, {
      source: 'museofile',
      sourceRef: r.Identifiant,
      name,
      category: 'museum',
      lng,
      lat,
      tags: ['tourism:museum', `museofile:${r.Identifiant}`],
      description,
      website,
    })
    count(stats, outcome)
    insertedRefs.push(r.Identifiant)
  }
  stats.softDeleted = await softDeleteMissing(client, 'museofile', insertedRefs)
  return stats
}
