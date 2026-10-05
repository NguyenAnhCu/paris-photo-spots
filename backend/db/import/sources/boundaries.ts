import type pg from 'pg'
import type { ImportContext } from '../context.js'
import { fetchJsonCached } from '../cache.js'
import { assertNoShrink, assertNonEmpty, count, newStats, upsertOutcome, type SourceStats } from '../guards.js'

type Feature<P> = { type: 'Feature'; properties: P; geometry: unknown }
type FeatureCollection<P> = { type: 'FeatureCollection'; features: Feature<P>[] }

const ARRONDISSEMENTS_URL =
  'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/arrondissements/exports/geojson'
const DEPARTMENTS_URL =
  'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson'
const IDF_DEPARTMENTS = ['75', '77', '78', '91', '92', '93', '94', '95']

const nonEmptyCollection = (name: string) => (fc: FeatureCollection<unknown>) =>
  assertNonEmpty(name, Array.isArray(fc.features) ? fc.features.length : 0)

async function upsertRegion(client: pg.ClientBase, code: string, name: string, type: string, geometry: unknown) {
  const { rows } = await client.query<{ inserted: boolean }>(
    `INSERT INTO regions (code, name, type, geom)
     VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
     ON CONFLICT (code) WHERE deleted_at IS NULL
     DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, geom = EXCLUDED.geom
     WHERE (regions.name, regions.type, regions.geom) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.type, EXCLUDED.geom)
     RETURNING (xmax = 0) AS inserted`,
    [code, name, type, JSON.stringify(geometry)],
  )
  return upsertOutcome(rows)
}

// Administrative boundaries are stable, so regions missing from a download are not soft-deleted.
export async function importBoundaries(client: pg.ClientBase, ctx: ImportContext): Promise<SourceStats> {
  const arrondissements = await fetchJsonCached<FeatureCollection<{ c_arinsee: number; l_ar: string; l_aroff: string }>>(
    ctx,
    'paris-arrondissements.geojson',
    ARRONDISSEMENTS_URL,
    undefined,
    nonEmptyCollection('paris-arrondissements'),
  )
  const departments = await fetchJsonCached<FeatureCollection<{ code: string; nom: string }>>(
    ctx,
    'france-departements.geojson',
    DEPARTMENTS_URL,
    undefined,
    nonEmptyCollection('france-departements'),
  )
  const idf = departments.features.filter((f) => IDF_DEPARTMENTS.includes(f.properties.code))

  const regions = [
    ...arrondissements.features.map((f) => ({
      code: String(f.properties.c_arinsee),
      name: `${f.properties.l_ar} – ${f.properties.l_aroff}`,
      type: 'arrondissement',
      geometry: f.geometry,
    })),
    ...idf.map((f) => ({ code: f.properties.code, name: f.properties.nom, type: 'department', geometry: f.geometry })),
  ]
  await assertNoShrink(client, ctx, 'regions', regions.length)

  const stats = newStats(regions.length)
  for (const r of regions) count(stats, await upsertRegion(client, r.code, r.name, r.type, r.geometry))
  return stats
}
