// Housekeeping, run on a schedule once deployed (e.g. daily):
//   npm run cleanup -w backend
// - expired sessions and sign-in codes;
// - anonymous identities that never got anything posted (a failed first upload) after RETENTION_DAYS;
// - files of photos rejected more than RETENTION_DAYS ago (the row stays, soft-deleted, for the decision history).
import { pathToFileURL } from 'node:url'
import { pool } from '../../src/db/pool.js'
import { removePhoto } from '../../src/storage/photoStorage.js'

export const RETENTION_DAYS = 30

export async function cleanup(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const sessions = await pool.query('DELETE FROM auth_sessions WHERE expires_at < $1', [now])
  const codes = await pool.query('DELETE FROM auth_verifications WHERE expires_at < $1', [now])
  const idle = await pool.query(
    `DELETE FROM users u
     WHERE u.is_anonymous AND u.created_at < $1
       AND NOT EXISTS (SELECT 1 FROM pois WHERE created_by = u.id)
       AND NOT EXISTS (SELECT 1 FROM photos WHERE user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM reports WHERE reporter_id = u.id)
     RETURNING u.id`,
    [cutoff],
  )
  if (idle.rowCount) await pool.query('DELETE FROM auth_sessions WHERE user_id = ANY($1)', [idle.rows.map((r) => r.id)])
  const rejected = await pool.query<{ file_name: string; thumb_name: string }>(
    `UPDATE photos SET deleted_at = $2
     WHERE status = 'rejected' AND reviewed_at < $1 AND deleted_at IS NULL
     RETURNING file_name, thumb_name`,
    [cutoff, now],
  )
  for (const row of rejected.rows) await removePhoto({ fileName: row.file_name, thumbName: row.thumb_name })
  return {
    sessions: sessions.rowCount ?? 0,
    codes: codes.rowCount ?? 0,
    anonymousUsers: idle.rowCount ?? 0,
    rejectedPhotos: rejected.rowCount ?? 0,
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  cleanup()
    .then((done) => console.log('Cleanup:', JSON.stringify(done)))
    .catch((err: unknown) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
