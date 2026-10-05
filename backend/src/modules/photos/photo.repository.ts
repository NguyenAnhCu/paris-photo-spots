import { pool } from '../../db/pool.js'

export type PhotoRow = {
  id: string
  poi_id: string
  file_name: string
  thumb_name: string
  width: number
  height: number
  author_name: string | null
  focal: string | null
  aperture: string | null
  shutter: string | null
  iso: string | null
  camera: string | null
  created_at: string
}

const COLUMNS = `id, poi_id, file_name, thumb_name, width, height, author_name, focal, aperture, shutter, iso, camera, created_at`

export const photoRepository = {
  async insert(input: Omit<PhotoRow, 'id' | 'created_at'>): Promise<PhotoRow> {
    const { rows } = await pool.query<PhotoRow>(
      `INSERT INTO photos (poi_id, file_name, thumb_name, width, height, author_name, focal, aperture, shutter, iso, camera)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${COLUMNS}`,
      [
        input.poi_id,
        input.file_name,
        input.thumb_name,
        input.width,
        input.height,
        input.author_name,
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
       FROM photos WHERE poi_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC, id
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
