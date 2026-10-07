import { pool, withTransaction } from '../../db/pool.js'

export type AdminUserRow = {
  id: string
  name: string
  email: string | null
  role: string
  is_anonymous: boolean
  posting_suspended_until: string | null
  created_at: string
  spots: number
  photos: number
}

export type LogRow = {
  id: string
  target_type: string
  target_id: string
  action: string
  reason_code: string | null
  note: string | null
  created_at: string
  actor_id: string
  actor_name: string | null
  target_name: string | null
}

const ANON_DOMAIN = '@anonymous.placeholder.invalid'

export const adminRepository = {
  // Staff first, then by most recent; anonymous identities show no (placeholder) email.
  async listUsers(params: { search?: string; role?: string; offset: number; limit: number }) {
    const { rows } = await pool.query<AdminUserRow & { total: string }>(
      `SELECT u.id, u.display_name AS name,
              CASE WHEN u.email LIKE '%' || $5 THEN NULL ELSE u.email END AS email,
              u.role, u.is_anonymous, u.posting_suspended_until, u.created_at,
              (SELECT count(*)::int FROM pois WHERE created_by = u.id AND deleted_at IS NULL) AS spots,
              (SELECT count(*)::int FROM photos WHERE user_id = u.id AND deleted_at IS NULL) AS photos,
              count(*) OVER () AS total
       FROM users u
       WHERE u.deleted_at IS NULL
         AND ($1::text IS NULL OR u.display_name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR u.role = $2)
       ORDER BY (u.role <> 'participant') DESC, u.created_at DESC, u.id
       OFFSET $3 LIMIT $4`,
      [params.search || null, params.role ?? null, params.offset, params.limit, ANON_DOMAIN],
    )
    return { items: rows, total: Number(rows[0]?.total ?? 0) }
  },

  async user(id: string): Promise<{ id: string; role: string; is_anonymous: boolean } | null> {
    const { rows } = await pool.query<{ id: string; role: string; is_anonymous: boolean }>(
      'SELECT id, role, is_anonymous FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id],
    )
    return rows[0] ?? null
  },

  async adminCount(): Promise<number> {
    const { rows } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND deleted_at IS NULL",
    )
    return rows[0]?.n ?? 0
  },

  async setRole(userId: string, role: string, actorId: string): Promise<void> {
    await withTransaction(async (client) => {
      await client.query('UPDATE users SET role = $2 WHERE id = $1', [userId, role])
      await client.query(
        `INSERT INTO moderation_actions (target_type, target_id, action, note, actor_id) VALUES ('user', $1, 'set_role', $2, $3)`,
        [userId, role, actorId],
      )
    })
  },

  async setSuspension(userId: string, until: Date | null, reasonCode: string | null, actorId: string) {
    await withTransaction(async (client) => {
      await client.query('UPDATE users SET posting_suspended_until = $2 WHERE id = $1', [userId, until])
      await client.query(
        `INSERT INTO moderation_actions (target_type, target_id, action, reason_code, actor_id) VALUES ('user', $1, $2, $3, $4)`,
        [userId, until ? 'suspend' : 'lift_suspension', reasonCode, actorId],
      )
    })
  },

  // The account and its sign-ins go for good; what they posted is taken out of public view (hidden) and keeps no
  // owner name. Better Auth tables are deleted by hand: there are no foreign keys to cascade.
  async deleteUser(userId: string, actorId: string): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        "UPDATE pois SET status = 'hidden', reviewed_by = $2, reviewed_at = NOW() WHERE created_by = $1 AND status <> 'hidden'",
        [userId, actorId],
      )
      await client.query(
        "UPDATE photos SET status = 'hidden', reviewed_by = $2, reviewed_at = NOW() WHERE user_id = $1 AND status <> 'hidden'",
        [userId, actorId],
      )
      await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId])
      await client.query('DELETE FROM auth_accounts WHERE user_id = $1', [userId])
      await client.query('DELETE FROM users WHERE id = $1', [userId])
      await client.query(
        `INSERT INTO moderation_actions (target_type, target_id, action, actor_id) VALUES ('user', $1, 'delete_user', $2)`,
        [userId, actorId],
      )
    })
  },

  async moderationLog(params: { actorId?: string; offset: number; limit: number }) {
    const { rows } = await pool.query<LogRow & { total: string }>(
      `SELECT ma.id, ma.target_type, ma.target_id, ma.action, ma.reason_code, ma.note, ma.created_at, ma.actor_id,
              a.display_name AS actor_name,
              COALESCE(sp.name, psp.name, tu.display_name) AS target_name,
              count(*) OVER () AS total
       FROM moderation_actions ma
       LEFT JOIN users a ON a.id = ma.actor_id
       LEFT JOIN pois sp ON ma.target_type = 'spot' AND sp.id = ma.target_id
       LEFT JOIN photos ph ON ma.target_type = 'photo' AND ph.id = ma.target_id
       LEFT JOIN pois psp ON psp.id = ph.poi_id
       LEFT JOIN users tu ON ma.target_type = 'user' AND tu.id = ma.target_id
       WHERE ($1::uuid IS NULL OR ma.actor_id = $1)
       ORDER BY ma.created_at DESC, ma.id
       OFFSET $2 LIMIT $3`,
      [params.actorId ?? null, params.offset, params.limit],
    )
    return { items: rows, total: Number(rows[0]?.total ?? 0) }
  },
}
