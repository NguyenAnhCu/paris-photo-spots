import { pool } from '../../db/pool.js'
import type { PoiCategory } from './poi.schemas.js'

export type PoiFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    id: string
    name: string
    category: PoiCategory
    navigo_zone: number | null
    walk_minutes: number | null
    distance_m?: number
  }
}

type PoiRow = {
  id: string
  name: string
  category: PoiCategory
  navigo_zone: number | null
  walk_minutes: number | null
  geometry: PoiFeature['geometry']
  distance_m?: number
}

const SELECT_COLUMNS = `p.id, p.name, p.category, p.navigo_zone, p.walk_minutes, ST_AsGeoJSON(p.geom)::json AS geometry`

function toFeature({ geometry, ...properties }: PoiRow): PoiFeature {
  return { type: 'Feature', geometry, properties }
}

export const poiRepository = {
  // Cast must match the expression index idx_pois_geog exactly, otherwise PostGIS falls back to a seq scan.
  async nearby(params: { lng: number; lat: number; radius: number; categories?: PoiCategory[]; limit: number }) {
    const { rows } = await pool.query<PoiRow>(
      `SELECT ${SELECT_COLUMNS},
              ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_m
       FROM pois p
       WHERE p.deleted_at IS NULL AND p.status = 'approved'
         AND ST_DWithin(p.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         AND ($4::text[] IS NULL OR p.category = ANY($4))
       ORDER BY distance_m
       LIMIT $5`,
      [params.lng, params.lat, params.radius, params.categories ?? null, params.limit],
    )
    return rows.map(toFeature)
  },

  async within(params: { polygonGeoJson: string; categories?: PoiCategory[]; limit: number }) {
    const { rows } = await pool.query<PoiRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM pois p
       WHERE p.deleted_at IS NULL AND p.status = 'approved'
         AND ST_Intersects(p.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))
         AND ($2::text[] IS NULL OR p.category = ANY($2))
       LIMIT $3`,
      [params.polygonGeoJson, params.categories ?? null, params.limit],
    )
    return rows.map(toFeature)
  },

  async inRegion(params: { regionCode: string; categories?: PoiCategory[]; limit: number }) {
    const { rows } = await pool.query<PoiRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM pois p
       JOIN regions r ON ST_Intersects(p.geom, r.geom)
       WHERE r.code = $1
         AND r.deleted_at IS NULL
         AND p.deleted_at IS NULL AND p.status = 'approved'
         AND ($2::text[] IS NULL OR p.category = ANY($2))
       LIMIT $3`,
      [params.regionCode, params.categories ?? null, params.limit],
    )
    return rows.map(toFeature)
  },

  async byId(id: string) {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.category, p.description, p.tags, p.opening_hours, p.price_level,
              p.navigo_zone, p.walk_minutes, p.website,
              ST_AsGeoJSON(p.geom)::json AS geometry,
              s.id AS stop_id, s.name AS stop_name, s.modes AS stop_modes, s.lines AS stop_lines
       FROM pois p
       LEFT JOIN transit_stops s ON s.id = p.nearest_stop_id AND s.deleted_at IS NULL
       WHERE p.id = $1 AND p.deleted_at IS NULL AND p.status = 'approved'`,
      [id],
    )
    return rows[0] ?? null
  },
}
