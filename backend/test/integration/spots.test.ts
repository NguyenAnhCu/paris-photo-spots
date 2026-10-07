import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'
import { spotRepository } from '../../src/modules/spots/spot.repository.js'
import { FAR_FROM_STATIONS, SPOTS } from '../fixtures/places.js'
import { setRole, signIn, type Agent } from './auth.js'
import { firstQueryOf, planNodes, resetDb, seedBulk, seedPlaces, type Seeded } from './db.js'

const app = createApp()
let seeded: Seeded
let author: Agent

beforeEach(async () => {
  await resetDb()
  seeded = await seedPlaces()
  author = await signIn(app)
  // These tests are about creating spots/photos, not moderation (moderation.test.ts): a reviewer's posts are public at once.
  await setRole(author, 'reviewer')
})

const VISIBLE = SPOTS.filter((s) => s.photoCategory && !s.deleted)
type Feature = { geometry: { coordinates: [number, number] }; properties: Record<string, unknown> }

describe('GET /api/v1/spots', () => {
  it('lists only visible photo spots, most popular first, as GeoJSON [lng, lat]', async () => {
    const res = await request(app).get('/api/v1/spots').expect(200)
    const features = res.body.features as Feature[]
    expect(res.body.type).toBe('FeatureCollection')
    expect(features.map((f) => f.properties.name)).toEqual([
      'Tháp Eiffel', // vi by default
      'Jardin du Luxembourg',
      'Pont Alexandre III',
      'Rue Crémieux', // no popularity → last
    ])
    expect(features).toHaveLength(VISIBLE.length)
    expect(features[0]?.geometry.coordinates).toEqual([2.2945, 48.8584])
    expect(features[0]?.properties).toMatchObject({
      id: seeded.spot.eiffel,
      photo_category: 'landmark',
      crowd_level: 2,
      photo_count: 0,
      // List cards get the 500 px Commons thumbnail, not the 1280 px original.
      cover_thumb_url: expect.stringMatching(/\/500px-Tour_Eiffel\.jpg$/),
    })
  })

  it('localizes names with ?lang= and falls back to the original name', async () => {
    const res = await request(app).get('/api/v1/spots?lang=en').expect(200)
    const names = (res.body.features as Feature[]).map((f) => f.properties.name)
    expect(names).toContain('Eiffel Tower')
    expect(names).toContain('Pont Alexandre III')
    await request(app).get('/api/v1/spots?lang=de').expect(400)
  })

  // Regression: a max-age cache served lists without a spot the user had just created.
  it('is revalidated on every request: no-cache + ETag → 304', async () => {
    const first = await request(app).get('/api/v1/spots').expect(200)
    expect(first.headers['cache-control']).toBe('no-cache')
    const etag = first.headers.etag as string
    await request(app).get('/api/v1/spots').set('If-None-Match', etag).expect(304)

    await author
      .post('/api/v1/spots')
      .send({ name: 'Square du Vert-Galant', photo_category: 'park', lng: 2.3387, lat: 48.8575 })
      .expect(201)
    const after = await request(app).get('/api/v1/spots').set('If-None-Match', etag).expect(200)
    expect((after.body.features as Feature[]).map((f) => f.properties.name)).toContain('Square du Vert-Galant')
  })
})

describe('GET /api/v1/spots/item', () => {
  it('returns the detail with cover, attribution and photo count', async () => {
    await pool.query(
      `INSERT INTO photos (poi_id, file_name, thumb_name, width, height) VALUES ($1, 'a.jpg', 'a_t.jpg', 10, 10), ($1, 'b.jpg', 'b_t.jpg', 10, 10)`,
      [seeded.spot.eiffel],
    )
    const res = await request(app).get(`/api/v1/spots/item?id=${seeded.spot.eiffel}&lang=fr`).expect(200)
    expect(res.body).toMatchObject({
      id: seeded.spot.eiffel,
      name: 'Tour Eiffel',
      name_original: 'Tour Eiffel',
      lng: 2.2945,
      lat: 48.8584,
      photo_count: 2,
      user_created: false,
      cover: { url: expect.stringContaining('1280px-'), attribution: 'Photo: Test author, CC BY-SA 4.0' },
    })
  })

  it('404 SPOT_NOT_FOUND for unknown, hidden or deleted spots; 400 for a malformed id', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000000', seeded.spot.quaiBranly, seeded.spot.deleted]) {
      const res = await request(app).get(`/api/v1/spots/item?id=${id}`).expect(404)
      expect(res.body.error.code).toBe('SPOT_NOT_FOUND')
    }
    const res = await request(app).get('/api/v1/spots/item?id=not-a-uuid').expect(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  // Guard: the planner pushes p.id = $1 into the grouped photo count and reads idx_photos_poi_id; a rewrite of
  // SPOT_SELECT must not turn this into an aggregate over every photo.
  it('counts photos with the per-spot index, not a scan of every photo', async () => {
    await seedBulk({ pois: 400, photosPerPoi: 20 })
    const [sql, params] = await firstQueryOf(() => spotRepository.byId(seeded.spot.eiffel))
    const scansOfPhotos = (await planNodes(sql, params)).filter((n) => n['Relation Name'] === 'photos')
    expect(scansOfPhotos.length).toBeGreaterThan(0)
    expect(scansOfPhotos.map((n) => n['Node Type'])).not.toContain('Seq Scan')
  })
})

describe('POST /api/v1/spots', () => {
  const body = { name: '  Quai de Bourbon ', photo_category: 'street', lng: 2.3553, lat: 48.8527, lang: 'fr' }

  it('creates the spot (trimmed name, localized for the author language) with the nearest station', async () => {
    const res = await author.post('/api/v1/spots').send(body).expect(201)
    expect(res.body).toMatchObject({
      name: 'Quai de Bourbon',
      photo_category: 'street',
      user_created: true,
      crowd_level: 2,
    })
    const { rows } = await pool.query(
      `SELECT source, source_ref, name_i18n, nearest_stop_id, navigo_zone, walk_minutes FROM pois WHERE id = $1`,
      [res.body.id],
    )
    expect(rows[0]).toMatchObject({
      source: 'user',
      source_ref: res.body.id,
      name_i18n: { fr: 'Quai de Bourbon' },
      nearest_stop_id: seeded.stop.chatelet, // ~950 m away
      navigo_zone: 1,
    })
    expect(rows[0].walk_minutes).toBeGreaterThanOrEqual(11)
    expect(rows[0].walk_minutes).toBeLessThanOrEqual(13)
  })

  it('leaves walk_minutes empty when the nearest station is beyond walking distance', async () => {
    const [lng, lat] = FAR_FROM_STATIONS
    const res = await author
      .post('/api/v1/spots')
      .send({ ...body, lng, lat })
      .expect(201)
    const { rows } = await pool.query(`SELECT nearest_stop_id, walk_minutes FROM pois WHERE id = $1`, [res.body.id])
    expect(rows[0]).toMatchObject({ walk_minutes: null })
    expect(rows[0].nearest_stop_id).not.toBeNull()
  })

  it('409 SPOT_DUPLICATE within 30 m of a visible spot, with the existing id', async () => {
    const res = await author
      .post('/api/v1/spots')
      .send({ ...body, lng: 2.2947, lat: 48.8585 }) // ~17 m from the Eiffel Tower fixture
      .expect(409)
    expect(res.body.error).toMatchObject({ code: 'SPOT_DUPLICATE', details: [{ id: seeded.spot.eiffel }] })
  })

  it('ignores hidden and deleted POIs when checking duplicates', async () => {
    await author
      .post('/api/v1/spots')
      .send({ ...body, lng: 2.3501, lat: 48.86 })
      .expect(201) // deleted fixture
    await author
      .post('/api/v1/spots')
      .send({ ...body, lng: 2.2977, lat: 48.8609 })
      .expect(201) // quai Branly
  })

  // Regression: the duplicate check and the insert ran separately: 20 simultaneous posts at one place created 17–20
  // spots. Timing-dependent before the fix (can pass by luck), deterministic after it.
  it('lets only one of many simultaneous posts at the same place through', async () => {
    const statuses = await Promise.all(
      Array.from({ length: 20 }, () =>
        author
          .post('/api/v1/spots')
          .send({ ...body, lng: 2.3012, lat: 48.8738 })
          .then((r) => r.status),
      ),
    )
    expect(statuses.filter((s) => s === 201)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(19)
  })

  it('400 OUT_OF_AREA outside Île-de-France, 400 VALIDATION_ERROR for bad input, nothing written', async () => {
    const out = await author
      .post('/api/v1/spots')
      .send({ ...body, lng: 4.8357, lat: 45.764 })
      .expect(400) // Lyon
    expect(out.body.error.code).toBe('OUT_OF_AREA')
    const bad = await author
      .post('/api/v1/spots')
      .send({ ...body, name: 'ab', photo_category: 'beach' })
      .expect(400)
    expect(bad.body.error.code).toBe('VALIDATION_ERROR')
    expect(bad.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['name', 'photo_category'])
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM pois WHERE source = 'user'`)
    expect(rows[0].n).toBe(0)
  })

  it('400 INVALID_JSON for a malformed body', async () => {
    const res = await author.post('/api/v1/spots').set('Content-Type', 'application/json').send('{"name":').expect(400)
    expect(res.body.error.code).toBe('INVALID_JSON')
  })
})
