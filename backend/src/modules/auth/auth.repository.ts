import type { PoolClient } from 'pg'
import { pool, withTransaction } from '../../db/pool.js'

export type ProfileRow = {
  id: string
  display_name: string
  is_anonymous: boolean
  role: string
  recovery_code_hash: string | null
  terms_version: string | null
  posting_suspended_until: string | null
}

export const authRepository = {
  async setRecoveryCodeHash(userId: string, hash: string): Promise<void> {
    await pool.query('UPDATE users SET recovery_code_hash = $1 WHERE id = $2', [hash, userId])
  },

  async userIdByRecoveryCodeHash(hash: string): Promise<string | null> {
    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM users WHERE recovery_code_hash = $1 AND deleted_at IS NULL',
      [hash],
    )
    return rows[0]?.id ?? null
  },

  // Everything an anonymous identity owned moves to the account it is linked into, in one transaction: a crash halfway
  // must not leave content owned by a user Better Auth is about to delete.
  async transferOwnership(fromUserId: string, toUserId: string): Promise<void> {
    await withTransaction(async (client: PoolClient) => {
      await client.query('UPDATE pois SET created_by = $2 WHERE created_by = $1', [fromUserId, toUserId])
      await client.query('UPDATE photos SET user_id = $2 WHERE user_id = $1', [fromUserId, toUserId])
      await client.query('UPDATE reports SET reporter_id = $2 WHERE reporter_id = $1', [fromUserId, toUserId])
      // Terms accepted while anonymous carry over unless the account accepted a version itself.
      await client.query(
        `UPDATE users t SET terms_version = COALESCE(t.terms_version, f.terms_version),
                            terms_accepted_at = COALESCE(t.terms_accepted_at, f.terms_accepted_at)
         FROM users f WHERE f.id = $1 AND t.id = $2`,
        [fromUserId, toUserId],
      )
    })
  },
}
