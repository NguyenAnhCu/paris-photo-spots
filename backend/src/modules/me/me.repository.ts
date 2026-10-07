import { pool } from '../../db/pool.js'

export type MeRow = {
  id: string
  display_name: string
  is_anonymous: boolean
  role: string
  has_recovery_code: boolean
  terms_version: string | null
  posting_suspended_until: Date | null
  unread_decisions: number
}

// Decisions a participant hears about (edits by reviewers are not news).
const DECISIONS = `('approve', 'reject', 'hide', 'restore')`

// The last decision on each item: what the author sees ("rejected: low quality").
const LAST_DECISION = (type: string, idColumn: string) => `(
  SELECT json_build_object('action', ma.action, 'reason_code', ma.reason_code, 'at', ma.created_at)
  FROM moderation_actions ma
  WHERE ma.target_type = '${type}' AND ma.target_id = ${idColumn} AND ma.action IN ${DECISIONS}
  ORDER BY ma.created_at DESC LIMIT 1) AS decision`

export type Submission = Record<string, unknown>

export const meRepository = {
  async byId(userId: string): Promise<MeRow | null> {
    const { rows } = await pool.query<MeRow>(
      `SELECT u.id, u.display_name, u.is_anonymous, u.role, u.recovery_code_hash IS NOT NULL AS has_recovery_code,
              u.terms_version, u.posting_suspended_until,
              (SELECT count(*)::int FROM moderation_actions ma
               WHERE ma.action IN ${DECISIONS} AND ma.created_at > COALESCE(u.notifications_seen_at, '-infinity')
                 AND ((ma.target_type = 'spot' AND ma.target_id IN (SELECT id FROM pois WHERE created_by = u.id))
                   OR (ma.target_type = 'photo' AND ma.target_id IN (SELECT id FROM photos WHERE user_id = u.id))))
                AS unread_decisions
       FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
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

  // The latest 100 of each, newest first.
  async submissions(userId: string): Promise<{ spots: Submission[]; photos: Submission[] }> {
    const spots = await pool.query(
      `SELECT p.id, p.name, p.photo_category, p.status, ST_X(p.geom) AS lng, ST_Y(p.geom) AS lat, p.created_at,
              ${LAST_DECISION('spot', 'p.id')}
       FROM pois p WHERE p.created_by = $1 AND p.deleted_at IS NULL
       ORDER BY p.created_at DESC LIMIT 100`,
      [userId],
    )
    const photos = await pool.query(
      `SELECT ph.id, ph.poi_id AS spot_id, p.name AS spot_name, ph.thumb_name, ph.status, ph.created_at,
              ${LAST_DECISION('photo', 'ph.id')}
       FROM photos ph JOIN pois p ON p.id = ph.poi_id
       WHERE ph.user_id = $1 AND ph.deleted_at IS NULL
       ORDER BY ph.created_at DESC LIMIT 100`,
      [userId],
    )
    return { spots: spots.rows, photos: photos.rows }
  },

  async markNotificationsSeen(userId: string): Promise<void> {
    await pool.query('UPDATE users SET notifications_seen_at = NOW() WHERE id = $1', [userId])
  },

  // For the trust level: approved posts ever, and rejections since `since`.
  async history(userId: string, since: Date): Promise<{ approved: number; rejectedRecently: number }> {
    const { rows } = await pool.query<{ approved: number; rejected_recently: number }>(
      `SELECT (SELECT count(*)::int FROM pois WHERE created_by = $1 AND status = 'approved' AND deleted_at IS NULL)
            + (SELECT count(*)::int FROM photos WHERE user_id = $1 AND status = 'approved' AND deleted_at IS NULL) AS approved,
              (SELECT count(*)::int FROM pois WHERE created_by = $1 AND status = 'rejected' AND reviewed_at >= $2)
            + (SELECT count(*)::int FROM photos WHERE user_id = $1 AND status = 'rejected' AND reviewed_at >= $2)
                AS rejected_recently`,
      [userId, since],
    )
    return { approved: rows[0]?.approved ?? 0, rejectedRecently: rows[0]?.rejected_recently ?? 0 }
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
