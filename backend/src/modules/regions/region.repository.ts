import { pool } from '../../db/pool.js'

export const regionRepository = {
  async list(type?: string) {
    const { rows } = await pool.query(
      `SELECT id, code, name, type, ST_AsGeoJSON(ST_Envelope(geom))::json AS bbox_geometry
       FROM regions
       WHERE deleted_at IS NULL AND ($1::text IS NULL OR type = $1)
       ORDER BY code`,
      [type ?? null],
    )
    return rows
  },

  // Simplified geometry keeps payloads small; full precision stays in the DB for spatial joins.
  async byCode(code: string, simplifyTolerance: number) {
    const { rows } = await pool.query(
      `SELECT id, code, name, type, ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, $2))::json AS geometry
       FROM regions
       WHERE code = $1 AND deleted_at IS NULL`,
      [code, simplifyTolerance],
    )
    return rows[0] ?? null
  },
}
