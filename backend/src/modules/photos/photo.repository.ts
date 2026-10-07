import { pool } from '../../db/pool.js'

export type PhotoRow = {
  id: string
  poi_id: string
  file_name: string
  thumb_name: string
  width: number
  height: number
  // Shown name: the uploader's current name; photos posted before accounts keep the name typed then.
  author_name: string | null
  focal: string | null
  aperture: string | null
  shutter: string | null
  iso: string | null
  camera: string | null
  created_at: string
}

const COLUMNS = `ph.id, ph.poi_id, ph.file_name, ph.thumb_name, ph.width, ph.height,
  COALESCE(u.display_name, ph.author_name) AS author_name, ph.focal, ph.aperture, ph.shutter, ph.iso, ph.camera, ph.created_at`
const FROM = `photos ph LEFT JOIN users u ON u.id = ph.user_id AND u.deleted_at IS NULL`

type PhotoInsert = Omit<PhotoRow, 'id' | 'created_at' | 'author_name'> & { user_id: string }

export const photoRepository = {
  async insert(input: PhotoInsert): Promise<PhotoRow> {
    const { rows } = await pool.query<PhotoRow>(
      `WITH ph AS (
         INSERT INTO photos (poi_id, file_name, thumb_name, width, height, user_id, focal, aperture, shutter, iso, camera)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *)
       SELECT ${COLUMNS} FROM ph LEFT JOIN users u ON u.id = ph.user_id`,
      [
        input.poi_id,
        input.file_name,
        input.thumb_name,
        input.width,
        input.height,
        input.user_id,
        input.focal,
        input.aperture,
        input.shutter,
        input.iso,
        input.camera,
      ],
    )
    const row = rows[0]
    if (!row) throw new Error('Photo insert returned no row')
    return row
  },

  async listBySpot(poiId: string, offset: number, limit: number): Promise<{ items: PhotoRow[]; total: number }> {
    const { rows } = await pool.query<PhotoRow & { total: string }>(
      `SELECT ${COLUMNS}, count(*) OVER () AS total
       FROM ${FROM} WHERE ph.poi_id = $1 AND ph.deleted_at IS NULL
       ORDER BY ph.created_at DESC, ph.id
       OFFSET $2 LIMIT $3`,
      [poiId, offset, limit],
    )
    if (rows.length > 0) return { items: rows, total: Number(rows[0]?.total ?? 0) }
    // Empty page (offset past the end): still report the real total.
    const { rows: countRows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM photos WHERE poi_id = $1 AND deleted_at IS NULL`,
      [poiId],
    )
    return { items: [], total: Number(countRows[0]?.n ?? 0) }
  },
}
