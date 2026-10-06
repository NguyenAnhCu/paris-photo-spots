import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'
import { STORAGE_ROOT } from '../../src/storage/photoStorage.js'
import { hasGps, jpegRotatedPortrait, jpegWithGps, notAnImage, pngImage } from '../fixtures/images.js'
import { resetDb, seedPlaces, type Seeded } from './db.js'

const app = createApp()
const PHOTOS_DIR = path.join(STORAGE_ROOT, 'photos')
const storedFiles = () => readdir(PHOTOS_DIR).catch(() => [] as string[])
let seeded: Seeded

beforeEach(async () => {
  await resetDb()
  seeded = await seedPlaces()
})

const upload = (file: Buffer | null, fields: Record<string, string>, type = 'image/jpeg', name = 'photo.jpg') => {
  const req = request(app).post('/api/v1/photos')
  for (const [k, v] of Object.entries(fields)) req.field(k, v)
  return file ? req.attach('file', file, { filename: name, contentType: type }) : req
}

describe('POST /api/v1/photos', () => {
  it('stores a re-encoded JPEG without any EXIF/GPS, plus a thumbnail, and records the EXIF summary', async () => {
    const original = await jpegWithGps(3000, 2000)
    expect(hasGps((await sharp(original).metadata()).exif)).toBe(true)

    const res = await upload(original, {
      spot_id: seeded.spot.eiffel,
      author_name: '  Linh ',
      focal: '35mm',
      aperture: 'f/1.8',
      shutter: '1/250s',
      iso: '100',
      camera: 'Sony ILCE-7M4',
    }).expect(201)
    expect(res.body).toMatchObject({
      spot_id: seeded.spot.eiffel,
      width: 2048,
      height: 1365,
      author_name: 'Linh',
      focal: '35mm',
      camera: 'Sony ILCE-7M4',
      url: expect.stringMatching(/^\/media\/photos\/[0-9a-f-]{36}\.jpg$/),
      thumb_url: expect.stringMatching(/_thumb\.jpg$/),
    })

    for (const url of [res.body.url, res.body.thumb_url] as string[]) {
      const file = await readFile(path.join(STORAGE_ROOT, url.replace('/media/', '')))
      const meta = await sharp(file).metadata()
      expect(meta.exif).toBeUndefined()
      expect(meta.format).toBe('jpeg')
    }
    const thumb = await sharp(
      await readFile(path.join(STORAGE_ROOT, (res.body.thumb_url as string).replace('/media/', ''))),
    ).metadata()
    expect(Math.max(thumb.width ?? 0, thumb.height ?? 0)).toBe(400)
  })

  it('serves the stored file under /media with a long immutable cache', async () => {
    const res = await upload(await pngImage(), { spot_id: seeded.spot.eiffel }, 'image/png', 'a.png').expect(201)
    const media = await request(app).get(res.body.url).expect(200)
    expect(media.headers['content-type']).toBe('image/jpeg')
    expect(media.headers['cache-control']).toContain('immutable')
    await request(app).get('/media/photos/does-not-exist.jpg').expect(404)
  })

  it('turns portrait phone photos upright and accepts PNG', async () => {
    const portrait = await upload(await jpegRotatedPortrait(), { spot_id: seeded.spot.eiffel }).expect(201)
    expect([portrait.body.width, portrait.body.height]).toEqual([400, 600])
    await upload(await pngImage(), { spot_id: seeded.spot.eiffel }, 'image/png', 'a.png').expect(201)
  })

  it('stores blank optional fields as NULL', async () => {
    const res = await upload(
      await pngImage(),
      { spot_id: seeded.spot.eiffel, author_name: '   ', camera: '' },
      'image/png',
    ).expect(201)
    const { rows } = await pool.query(`SELECT author_name, camera FROM photos WHERE id = $1`, [res.body.id])
    expect(rows[0]).toEqual({ author_name: null, camera: null })
  })

  it.each([
    ['a text file labelled as JPEG', () => notAnImage, 'image/jpeg', 'INVALID_IMAGE'],
    ['an unsupported type', () => notAnImage, 'text/plain', 'UNSUPPORTED_IMAGE'],
    ['a file over MAX_UPLOAD_MB', () => Buffer.alloc(11 * 1024 * 1024, 1), 'image/jpeg', 'FILE_TOO_LARGE'],
  ])('400 for %s, nothing stored', async (_label, file, type, code) => {
    const before = await storedFiles()
    const res = await upload(file(), { spot_id: seeded.spot.eiffel }, type).expect(400)
    expect(res.body.error.code).toBe(code)
    expect(await storedFiles()).toEqual(before)
  })

  it('400 IMAGE_TOO_LARGE for a small file declaring a huge image (decompression bomb)', async () => {
    const bomb = await sharp({ create: { width: 12_000, height: 9_000, channels: 3, background: '#808080' } })
      .png({ compressionLevel: 9 })
      .toBuffer()
    const res = await upload(bomb, { spot_id: seeded.spot.eiffel }, 'image/png', 'bomb.png').expect(400)
    expect(res.body.error.code).toBe('IMAGE_TOO_LARGE')
  })

  it('400 when the file or the spot id is missing, VALIDATION_ERROR for a malformed EXIF field', async () => {
    expect((await upload(null, { spot_id: seeded.spot.eiffel }).expect(400)).body.error.code).toBe(
      'UPLOAD_MISSING_FILE',
    )
    expect((await upload(await pngImage(), {}, 'image/png').expect(400)).body.error.code).toBe('VALIDATION_ERROR')
    const res = await upload(await pngImage(), { spot_id: seeded.spot.eiffel, iso: '<script>' }, 'image/png').expect(
      400,
    )
    expect(res.body.error.details[0].field).toBe('iso')
  })

  it('404 for a spot that does not exist or is hidden, and leaves no file behind', async () => {
    const before = await storedFiles()
    for (const id of ['00000000-0000-4000-8000-000000000000', seeded.spot.quaiBranly, seeded.spot.deleted]) {
      const res = await upload(await pngImage(), { spot_id: id }, 'image/png').expect(404)
      expect(res.body.error.code).toBe('SPOT_NOT_FOUND')
    }
    expect(await storedFiles()).toEqual(before)
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM photos`)
    expect(rows[0].n).toBe(0)
  })

  it('counts the new photo on the spot', async () => {
    await upload(await pngImage(), { spot_id: seeded.spot.luxembourg }, 'image/png').expect(201)
    const res = await request(app).get(`/api/v1/spots/item?id=${seeded.spot.luxembourg}`).expect(200)
    expect(res.body.photo_count).toBe(1)
  })
})

describe('POST /api/v1/photos/list', () => {
  beforeEach(async () => {
    // 5 photos, created one minute apart: newest first.
    await pool.query(
      `INSERT INTO photos (poi_id, file_name, thumb_name, width, height, author_name, created_at)
       SELECT $1, 'p' || i || '.jpg', 'p' || i || '_thumb.jpg', 100, 100, 'A' || i, NOW() - (i || ' minutes')::interval
       FROM generate_series(1, 5) AS i`,
      [seeded.spot.eiffel],
    )
    await pool.query(
      `INSERT INTO photos (poi_id, file_name, thumb_name, width, height, deleted_at) VALUES ($1, 'gone.jpg', 'gone_t.jpg', 1, 1, NOW())`,
      [seeded.spot.eiffel],
    )
  })

  it('pages newest first with total and has_more, skipping deleted photos', async () => {
    const first = await request(app)
      .post('/api/v1/photos/list')
      .send({ spot_id: seeded.spot.eiffel, limit: 2 })
      .expect(200)
    expect(first.body).toMatchObject({ total: 5, offset: 0, limit: 2, has_more: true })
    expect(first.body.items.map((p: { author_name: string }) => p.author_name)).toEqual(['A1', 'A2'])
    expect(first.body.items[0]).toMatchObject({ spot_id: seeded.spot.eiffel, url: '/media/photos/p1.jpg' })
    expect(first.body.items[0]).not.toHaveProperty('file_name')

    const last = await request(app)
      .post('/api/v1/photos/list')
      .send({ spot_id: seeded.spot.eiffel, offset: 4, limit: 2 })
      .expect(200)
    expect(last.body).toMatchObject({ total: 5, has_more: false })
    expect(last.body.items).toHaveLength(1)
  })

  it('still reports the total past the last page', async () => {
    const res = await request(app)
      .post('/api/v1/photos/list')
      .send({ spot_id: seeded.spot.eiffel, offset: 50 })
      .expect(200)
    expect(res.body).toMatchObject({ items: [], total: 5, has_more: false })
  })

  it('400 for limit above 60, 404 for an unknown spot', async () => {
    await request(app).post('/api/v1/photos/list').send({ spot_id: seeded.spot.eiffel, limit: 61 }).expect(400)
    const res = await request(app)
      .post('/api/v1/photos/list')
      .send({ spot_id: '00000000-0000-4000-8000-000000000000' })
      .expect(404)
    expect(res.body.error.code).toBe('SPOT_NOT_FOUND')
  })
})
