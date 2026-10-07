import type { PoolClient } from 'pg'
import { pool, withTransaction } from '../../db/pool.js'
import { SAME_IMAGE_MAX_DISTANCE } from '../../lib/imageSignals.js'
import type { ContentStatus, ModerationAction } from '../../lib/moderation.js'

// The author of a queued item, with what a reviewer needs to judge the trust level.
const AUTHOR = (ownerColumn: string) => `
  json_build_object(
    'id', u.id, 'name', u.display_name, 'is_anonymous', u.is_anonymous,
    'approved', (SELECT count(*) FROM pois WHERE created_by = u.id AND status = 'approved')
              + (SELECT count(*) FROM photos WHERE user_id = u.id AND status = 'approved'),
    'rejected', (SELECT count(*) FROM pois WHERE created_by = u.id AND status = 'rejected')
              + (SELECT count(*) FROM photos WHERE user_id = u.id AND status = 'rejected'),
    'suspended_until', u.posting_suspended_until
  ) AS author
  FROM users u WHERE u.id = ${ownerColumn}`

export type QueuedPhoto = {
  id: string
  spot_id: string
  spot_name: string
  spot_lng: number
  spot_lat: number
  file_name: string
  thumb_name: string
  focal: string | null
  aperture: string | null
  shutter: string | null
  iso: string | null
  camera: string | null
  gps_distance: string | null
  duplicate_of: string | null
  created_at: string
  author: Record<string, unknown> | null
}

export type QueuedSpot = {
  id: string
  name: string
  photo_category: string
  tip: string | null
  lng: number
  lat: number
  created_at: string
  near_name: string | null
  near_m: number | null
  author: Record<string, unknown> | null
}

export type QueuedReport = {
  id: string
  target_type: 'spot' | 'photo'
  target_id: string
  reason_code: string | null
  message: string
  created_at: string
  target_name: string | null
  target_status: string | null
  thumb_name: string | null
  reporter_name: string | null
}

const totalOf = (rows: { total?: string }[]) => Number(rows[0]?.total ?? 0)

// Whitelisted table names for the two moderated content types (never interpolated from input).
const TABLE = { spot: 'pois', photo: 'photos' } as const

async function logAction(
  client: PoolClient,
  entry: {
    targetType: string
    targetId: string
    action: string
    reasonCode?: string | null
    note?: string | null
    actorId: string
  },
) {
  await client.query(
    `INSERT INTO moderation_actions (target_type, target_id, action, reason_code, note, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entry.targetType, entry.targetId, entry.action, entry.reasonCode ?? null, entry.note ?? null, entry.actorId],
  )
}

export const moderationRepository = {
  // Oldest first: the queue is worked through in order. duplicate_of = another photo of the same spot whose hash is
  // within SAME_IMAGE_MAX_DISTANCE bits (bit_count on the XOR of the two 64-bit hashes).
  async queuePhotos(offset: number, limit: number): Promise<{ items: QueuedPhoto[]; total: number }> {
    const { rows } = await pool.query<QueuedPhoto & { total: string }>(
      `SELECT ph.id, ph.poi_id AS spot_id, p.name AS spot_name, ST_X(p.geom) AS spot_lng, ST_Y(p.geom) AS spot_lat,
              ph.file_name, ph.thumb_name, ph.focal, ph.aperture, ph.shutter, ph.iso, ph.camera, ph.gps_distance,
              ph.created_at,
              (SELECT o.id FROM photos o
               WHERE o.poi_id = ph.poi_id AND o.id <> ph.id AND o.deleted_at IS NULL AND o.status <> 'rejected'
                 AND o.phash IS NOT NULL AND ph.phash IS NOT NULL
                 AND bit_count(('x' || o.phash)::bit(64) # ('x' || ph.phash)::bit(64)) <= $3
               ORDER BY o.created_at LIMIT 1) AS duplicate_of,
              (SELECT ${AUTHOR('ph.user_id')}),
              count(*) OVER () AS total
       FROM photos ph JOIN pois p ON p.id = ph.poi_id
       WHERE ph.status = 'pending' AND ph.deleted_at IS NULL AND p.deleted_at IS NULL
       ORDER BY ph.created_at, ph.id
       OFFSET $1 LIMIT $2`,
      [offset, limit, SAME_IMAGE_MAX_DISTANCE],
    )
    return { items: rows, total: totalOf(rows) }
  },

  // near_* = the closest public spot within 100 m: a likely duplicate.
  async queueSpots(offset: number, limit: number): Promise<{ items: QueuedSpot[]; total: number }> {
    const { rows } = await pool.query<QueuedSpot & { total: string }>(
      `SELECT p.id, p.name, p.photo_category, p.tip, ST_X(p.geom) AS lng, ST_Y(p.geom) AS lat, p.created_at,
              near.name AS near_name, round(near.m)::int AS near_m,
              (SELECT ${AUTHOR('p.created_by')}),
              count(*) OVER () AS total
       FROM pois p
       LEFT JOIN LATERAL (
         SELECT o.name, ST_Distance(o.geom::geography, p.geom::geography) AS m
         FROM pois o
         WHERE o.id <> p.id AND o.status = 'approved' AND o.deleted_at IS NULL AND o.photo_category IS NOT NULL
           AND ST_DWithin(o.geom::geography, p.geom::geography, 100)
         ORDER BY o.geom::geography <-> p.geom::geography LIMIT 1
       ) near ON true
       WHERE p.status = 'pending' AND p.deleted_at IS NULL
       ORDER BY p.created_at, p.id
       OFFSET $1 LIMIT $2`,
      [offset, limit],
    )
    return { items: rows, total: totalOf(rows) }
  },

  async queueReports(offset: number, limit: number): Promise<{ items: QueuedReport[]; total: number }> {
    const { rows } = await pool.query<QueuedReport & { total: string }>(
      `SELECT r.id, r.target_type, r.target_id, r.reason_code, r.message, r.created_at,
              COALESCE(sp.name, psp.name) AS target_name,
              COALESCE(sp.status, ph.status) AS target_status,
              ph.thumb_name,
              u.display_name AS reporter_name,
              count(*) OVER () AS total
       FROM reports r
       LEFT JOIN pois sp ON r.target_type = 'spot' AND sp.id = r.target_id
       LEFT JOIN photos ph ON r.target_type = 'photo' AND ph.id = r.target_id
       LEFT JOIN pois psp ON psp.id = ph.poi_id
       LEFT JOIN users u ON u.id = r.reporter_id
       WHERE r.status = 'open' AND r.deleted_at IS NULL AND r.target_id IS NOT NULL
       ORDER BY r.created_at, r.id
       OFFSET $1 LIMIT $2`,
      [offset, limit],
    )
    return { items: rows, total: totalOf(rows) }
  },

  // Status change + its history entry in one transaction; the row is locked so two reviewers cannot both decide.
  // `decide` returns the status found (null = no such item), and only writes when `next` accepts it.
  async decide(input: {
    targetType: 'spot' | 'photo'
    targetId: string
    action: ModerationAction
    next: (current: ContentStatus) => ContentStatus | null
    reasonCode?: string | null
    note?: string | null
    actorId: string
  }): Promise<{ found: false } | { found: true; from: ContentStatus; to: ContentStatus | null }> {
    return withTransaction(async (client) => {
      const table = TABLE[input.targetType]
      const { rows } = await client.query<{ status: ContentStatus }>(
        `SELECT status FROM ${table} WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [input.targetId],
      )
      const from = rows[0]?.status
      if (!from) return { found: false }
      const to = input.next(from)
      if (!to) return { found: true, from, to: null }
      await client.query(`UPDATE ${table} SET status = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $1`, [
        input.targetId,
        to,
        input.actorId,
      ])
      await logAction(client, { ...input, action: input.action })
      // Acting on content settles the reports about it.
      await client.query(
        `UPDATE reports SET status = 'resolved', resolved_by = $3, resolved_at = NOW()
         WHERE target_type = $1 AND target_id = $2 AND status = 'open'`,
        [input.targetType, input.targetId, input.actorId],
      )
      return { found: true, from, to }
    })
  },

  async updateSpot(
    id: string,
    fields: { name?: string; photo_category?: string; tip?: string | null },
    actorId: string,
  ): Promise<boolean> {
    return withTransaction(async (client) => {
      const { rowCount } = await client.query(
        `UPDATE pois SET name = COALESCE($2, name),
                         name_i18n = CASE WHEN $2::text IS NULL THEN name_i18n ELSE '{}'::jsonb END,
                         photo_category = COALESCE($3, photo_category),
                         tip = CASE WHEN $5 THEN $4 ELSE tip END
         WHERE id = $1 AND deleted_at IS NULL AND photo_category IS NOT NULL`,
        [id, fields.name ?? null, fields.photo_category ?? null, fields.tip ?? null, fields.tip !== undefined],
      )
      if (!rowCount) return false
      await logAction(client, { targetType: 'spot', targetId: id, action: 'edit', actorId })
      return true
    })
  },

  async userRole(userId: string): Promise<string | null> {
    const { rows } = await pool.query<{ role: string }>('SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL', [
      userId,
    ])
    return rows[0]?.role ?? null
  },

  async suspend(input: { userId: string; until: Date; reasonCode: string; note?: string; actorId: string }) {
    await withTransaction(async (client) => {
      await client.query('UPDATE users SET posting_suspended_until = $2 WHERE id = $1', [input.userId, input.until])
      await logAction(client, {
        targetType: 'user',
        targetId: input.userId,
        action: 'suspend',
        reasonCode: input.reasonCode,
        note: input.note,
        actorId: input.actorId,
      })
    })
  },

  async resolveReport(id: string, outcome: string, actorId: string, note?: string): Promise<boolean> {
    return withTransaction(async (client) => {
      const { rowCount } = await client.query(
        `UPDATE reports SET status = $2, resolved_by = $3, resolved_at = NOW()
         WHERE id = $1 AND status = 'open' AND deleted_at IS NULL`,
        [id, outcome, actorId],
      )
      if (!rowCount) return false
      await logAction(client, { targetType: 'report', targetId: id, action: outcome, note, actorId })
      return true
    })
  },
}
