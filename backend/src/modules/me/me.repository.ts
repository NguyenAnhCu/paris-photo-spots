import { pool } from '../../db/pool.js'

export type MeRow = {
  id: string
  display_name: string
  is_anonymous: boolean
  role: string
  has_recovery_code: boolean
  terms_version: string | null
  posting_suspended_until: Date | null
}

export const meRepository = {
  async byId(userId: string): Promise<MeRow | null> {
    const { rows } = await pool.query<MeRow>(
      `SELECT id, display_name, is_anonymous, role, recovery_code_hash IS NOT NULL AS has_recovery_code,
              terms_version, posting_suspended_until
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    )
    return rows[0] ?? null
  },

  async acceptTerms(userId: string, version: string): Promise<void> {
    await pool.query('UPDATE users SET terms_version = $2, terms_accepted_at = NOW() WHERE id = $1', [userId, version])
  },

  async rename(userId: string, name: string): Promise<void> {
    await pool.query('UPDATE users SET display_name = $2 WHERE id = $1', [userId, name])
  },

  // Rolling window, so a quota does not reset at midnight for everyone at once.
  async postsSince(userId: string, since: Date): Promise<{ spots: number; photos: number }> {
    const { rows } = await pool.query<{ spots: number; photos: number }>(
      `SELECT (SELECT count(*)::int FROM pois WHERE created_by = $1 AND created_at >= $2) AS spots,
              (SELECT count(*)::int FROM photos WHERE user_id = $1 AND created_at >= $2) AS photos`,
      [userId, since],
    )
    return rows[0] ?? { spots: 0, photos: 0 }
  },
}
