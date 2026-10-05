import { pool } from '../../db/pool.js'

type TileLayer = {
  minZoom: number
  // Must be a static SQL fragment: layer names come from a whitelist, never from user input.
  sql: string
}

// The tile envelope is in 3857; transform the envelope (not the column) so the GIST index on geom (4326) is used.
const LAYERS: Record<string, TileLayer> = {
  pois: {
    minZoom: 10,
    sql: `
      WITH bounds AS (SELECT ST_TileEnvelope($1, $2, $3) AS geom_3857),
      mvtgeom AS (
        SELECT ST_AsMVTGeom(ST_Transform(p.geom, 3857), b.geom_3857, 4096, 64, true) AS geom,
               p.id::text AS id, p.name, p.category
        FROM pois p, bounds b
        WHERE p.deleted_at IS NULL
          AND p.geom && ST_Transform(b.geom_3857, 4326)
          AND ($4::text[] IS NULL OR p.category = ANY($4))
      )
      SELECT ST_AsMVT(mvtgeom.*, 'pois', 4096, 'geom') AS tile FROM mvtgeom`,
  },
  transit_stops: {
    minZoom: 11,
    sql: `
      WITH bounds AS (SELECT ST_TileEnvelope($1, $2, $3) AS geom_3857),
      mvtgeom AS (
        SELECT ST_AsMVTGeom(ST_Transform(s.geom, 3857), b.geom_3857, 4096, 64, true) AS geom,
               s.id::text AS id, s.name, array_to_string(s.modes, ',') AS modes,
               array_to_string(s.lines, ',') AS lines, s.navigo_zone
        FROM transit_stops s, bounds b
        WHERE s.deleted_at IS NULL
          AND s.geom && ST_Transform(b.geom_3857, 4326)
          AND ($4::text[] IS NULL OR s.modes && $4)
      )
      SELECT ST_AsMVT(mvtgeom.*, 'transit_stops', 4096, 'geom') AS tile FROM mvtgeom`,
  },
  regions: {
    minZoom: 6,
    sql: `
      WITH bounds AS (SELECT ST_TileEnvelope($1, $2, $3) AS geom_3857),
      mvtgeom AS (
        SELECT ST_AsMVTGeom(ST_Transform(r.geom, 3857), b.geom_3857, 4096, 64, true) AS geom,
               r.id::text AS id, r.code, r.name, r.type
        FROM regions r, bounds b
        WHERE r.deleted_at IS NULL
          AND r.geom && ST_Transform(b.geom_3857, 4326)
          AND ($4::text[] IS NULL OR r.type = ANY($4))
      )
      SELECT ST_AsMVT(mvtgeom.*, 'regions', 4096, 'geom') AS tile FROM mvtgeom`,
  },
}

export const tileRepository = {
  layer(name: string): TileLayer | undefined {
    return LAYERS[name]
  },

  async tile(layer: TileLayer, z: number, x: number, y: number, filter?: string[]): Promise<Buffer> {
    const { rows } = await pool.query<{ tile: Buffer }>(layer.sql, [z, x, y, filter ?? null])
    return rows[0]?.tile ?? Buffer.alloc(0)
  },
}
