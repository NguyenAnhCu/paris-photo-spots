import { pool, withTransaction } from '../../db/pool.js'
import type { PhotoCategory } from './spot.schemas.js'

export type SpotRow = {
  id: string
  name: string
  name_i18n: Record<string, string>
  photo_category: PhotoCategory
  crowd_level: 1 | 2 | 3
  best_time: string | null
  tip: string | null
  lng: number
  lat: number
  cover_photo_url: string | null
  cover_photo_page_url: string | null
  cover_photo_attribution: string | null
  photo_count: number
  source: string
}

// photo_count via a grouped subquery: one pass over photos instead of one count per spot.
const SPOT_SELECT = `
  SELECT p.id, p.name, p.name_i18n, p.photo_category, p.crowd_level, p.best_time, p.tip, p.source,
         ST_X(p.geom) AS lng, ST_Y(p.geom) AS lat,
         p.cover_photo_url, p.cover_photo_page_url, p.cover_photo_attribution,
         COALESCE(ph.n, 0)::int AS photo_count
  FROM pois p
  LEFT JOIN (SELECT poi_id, count(*) AS n FROM photos WHERE deleted_at IS NULL GROUP BY poi_id) ph ON ph.poi_id = p.id
  WHERE p.deleted_at IS NULL AND p.photo_category IS NOT NULL`

export const spotRepository = {
  async listAll(): Promise<SpotRow[]> {
    const { rows } = await pool.query<SpotRow>(`${SPOT_SELECT} ORDER BY p.popularity DESC NULLS LAST, p.name`)
    return rows
  },

  async byId(id: string): Promise<SpotRow | null> {
    const { rows } = await pool.query<SpotRow>(`${SPOT_SELECT} AND p.id = $1`, [id])
    return rows[0] ?? null
  },

  async findWithin(lng: number, lat: number, radiusM: number): Promise<{ id: string; name: string } | null> {
    const { rows } = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM pois
       WHERE deleted_at IS NULL AND photo_category IS NOT NULL
         AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
       ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       LIMIT 1`,
      [lng, lat, radiusM],
    )
    return rows[0] ?? null
  },

  // User-created spot. Nearest station / zone / walk are computed right away (same rule as the import's
  // postprocess.sql) so the spot is ready for the future routing feature. source_ref = id keeps the
  // (source, source_ref) unique index meaningful.
  async insertUserSpot(input: {
    name: string
    photoCategory: PhotoCategory
    lng: number
    lat: number
    tip: string | null
    nameI18n: Record<string, string>
    walkMetersPerMinute: number
    maxWalkMeters: number
  }): Promise<string> {
    // Two statements: a data-modifying CTE cannot UPDATE the row its own INSERT created (same snapshot).
    return withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO pois (source, name, category, photo_category, tip, name_i18n, crowd_level, geom)
         VALUES ('user', $1, 'user_spot', $2, $3, $4::jsonb, 2, ST_SetSRID(ST_MakePoint($5, $6), 4326))
         RETURNING id`,
        [input.name, input.photoCategory, input.tip, JSON.stringify(input.nameI18n), input.lng, input.lat],
      )
      const id = rows[0]?.id
      if (!id) throw new Error('Spot insert returned no id')
      await client.query(
        `UPDATE pois p
         SET source_ref = p.id::text,
             nearest_stop_id = b.stop_id,
             navigo_zone = b.navigo_zone,
             walk_minutes = CASE WHEN b.distance_m <= $3 THEN CEIL(b.distance_m / $2) END
         FROM (SELECT s.id AS stop_id, s.navigo_zone,
                      ST_Distance(s.geom::geography, (SELECT geom FROM pois WHERE id = $1)::geography) AS distance_m
               FROM transit_stops s
               WHERE s.deleted_at IS NULL
               ORDER BY s.geom <-> (SELECT geom FROM pois WHERE id = $1)
               LIMIT 1) b
         WHERE p.id = $1`,
        [id, input.walkMetersPerMinute, input.maxWalkMeters],
      )
      return id
    })
  },
}
