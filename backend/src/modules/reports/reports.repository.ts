import { pool } from '../../db/pool.js'

export const reportsRepository = {
  // Public content only: what is not approved cannot be seen, hence not reported. Returns the spot it belongs to.
  async publicTarget(targetType: 'spot' | 'photo', targetId: string): Promise<{ poi_id: string } | null> {
    const sql =
      targetType === 'spot'
        ? `SELECT p.id AS poi_id FROM pois p
           WHERE p.id = $1 AND p.status = 'approved' AND p.deleted_at IS NULL AND p.photo_category IS NOT NULL`
        : `SELECT ph.poi_id FROM photos ph JOIN pois p ON p.id = ph.poi_id
           WHERE ph.id = $1 AND ph.status = 'approved' AND ph.deleted_at IS NULL
             AND p.status = 'approved' AND p.deleted_at IS NULL`
    const { rows } = await pool.query<{ poi_id: string }>(sql, [targetId])
    return rows[0] ?? null
  },

  // One open report per person and target: reporting again changes nothing (no error, no duplicate).
  async createOnce(input: {
    reporterId: string
    targetType: 'spot' | 'photo'
    targetId: string
    poiId: string
    reasonCode: string
    message: string
  }): Promise<void> {
    await pool.query(
      `INSERT INTO reports (reporter_id, poi_id, type, message, target_type, target_id, reason_code, geom)
       SELECT $1, $2, 'content', $3, $4, $5, $6, p.geom FROM pois p WHERE p.id = $2
       ON CONFLICT (reporter_id, target_type, target_id) WHERE status = 'open' AND deleted_at IS NULL AND target_id IS NOT NULL
       DO NOTHING`,
      [input.reporterId, input.poiId, input.message, input.targetType, input.targetId, input.reasonCode],
    )
  },
}
