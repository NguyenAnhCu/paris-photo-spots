// PostGIS behaviour behind the pois / regions / tiles endpoints, against known places (test/fixtures/places.ts).
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'
import { poiRepository } from '../../src/modules/pois/poi.repository.js'
import { REGION_7E } from '../fixtures/places.js'
import { firstQueryOf, planNodes, resetDb, seedBulk, seedPlaces, type Seeded } from './db.js'

const app = createApp()
let seeded: Seeded

beforeEach(async () => {
  await resetDb()
  seeded = await seedPlaces()
})

type Feature = { properties: { id: string; name: string; distance_m?: number } }
const names = (body: { features: Feature[] }) => body.features.map((f) => f.properties.name).sort()

// Slippy-map tile containing a point (same formula as MapLibre / ST_TileEnvelope).
function tileOf(lng: number, lat: number, z: number) {
  const n = 2 ** z
  const rad = (lat * Math.PI) / 180
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n),
  }
}

describe('GET /api/v1/pois/nearby (ST_DWithin on geography)', () => {
  it('finds POIs within the radius, nearest first, with distances in metres', async () => {
    const res = await request(app).get('/api/v1/pois/nearby?lng=2.2945&lat=48.8584&radius=600').expect(200)
    const features = res.body.features as Feature[]
    // Tour Eiffel (0 m) then Musée du quai Branly (~400 m); the deleted fixture and farther spots are excluded.
    expect(features.map((f) => f.properties.name)).toEqual(['Tour Eiffel', 'Musée du quai Branly'])
    expect(features[0]?.properties.distance_m).toBeCloseTo(0, 0)
    expect(features[1]?.properties.distance_m).toBeGreaterThan(300)
    expect(features[1]?.properties.distance_m).toBeLessThan(600)
  })

  it('filters by category and validates the radius', async () => {
    const res = await request(app)
      .get('/api/v1/pois/nearby?lng=2.2945&lat=48.8584&radius=600&categories=museum')
      .expect(200)
    expect(names(res.body)).toEqual(['Musée du quai Branly'])
    await request(app).get('/api/v1/pois/nearby?lng=2.2945&lat=48.8584&radius=999999').expect(400)
    await request(app).get('/api/v1/pois/nearby?lng=2.2945&lat=48.8584&radius=100&categories=zoo').expect(400)
  })
})

describe('POST /api/v1/pois/within and GET /api/v1/pois/in-region (ST_Intersects)', () => {
  const polygon = { type: 'Polygon', coordinates: [REGION_7E.ring] }

  it('returns the POIs inside a drawn polygon', async () => {
    const res = await request(app).post('/api/v1/pois/within').send({ polygon }).expect(200)
    expect(names(res.body)).toEqual(['Musée du quai Branly', 'Pont Alexandre III', 'Tour Eiffel'])
  })

  it('returns the POIs inside a stored region, 404-free empty result for an unknown code', async () => {
    const res = await request(app).get(`/api/v1/pois/in-region?region_code=${REGION_7E.code}`).expect(200)
    expect(names(res.body)).toEqual(['Musée du quai Branly', 'Pont Alexandre III', 'Tour Eiffel'])
    const none = await request(app).get('/api/v1/pois/in-region?region_code=99999').expect(200)
    expect(none.body.features).toEqual([])
  })

  it('rejects polygons that are not closed rings or too complex', async () => {
    await request(app)
      .post('/api/v1/pois/within')
      .send({
        polygon: {
          type: 'Polygon',
          coordinates: [
            [
              [2, 48],
              [3, 49],
            ],
          ],
        },
      })
      .expect(400)
    const ring = Array.from({ length: 1001 }, (_, i) => [2.3 + Math.cos(i) / 100, 48.85 + Math.sin(i) / 100])
    const res = await request(app)
      .post('/api/v1/pois/within')
      .send({ polygon: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } })
      .expect(400)
    expect(res.body.error.code).toBe('POLYGON_TOO_COMPLEX')
  })
})

describe('GET /api/v1/pois/item and /api/v1/regions', () => {
  it('returns a POI with its nearest station once postprocess has linked it', async () => {
    await pool.query(`UPDATE pois SET nearest_stop_id = $1, walk_minutes = 9 WHERE id = $2`, [
      seeded.stop.birHakeim,
      seeded.spot.eiffel,
    ])
    const res = await request(app).get(`/api/v1/pois/item?id=${seeded.spot.eiffel}`).expect(200)
    expect(res.body).toMatchObject({ name: 'Tour Eiffel', walk_minutes: 9, stop_name: 'Bir-Hakeim', stop_lines: ['6'] })
    const missing = await request(app).get('/api/v1/pois/item?id=00000000-0000-4000-8000-000000000000').expect(404)
    expect(missing.body.error.code).toBe('POI_NOT_FOUND')
  })

  it('lists regions by type and returns one region outline', async () => {
    const list = await request(app).get('/api/v1/regions?type=arrondissement').expect(200)
    expect(list.body.items.map((r: { code: string }) => r.code)).toEqual([REGION_7E.code])
    const item = await request(app).get(`/api/v1/regions/item?code=${REGION_7E.code}`).expect(200)
    expect(item.body.geometry.type).toBe('Polygon')
    await request(app).get('/api/v1/regions/item?code=nope').expect(404)
  })
})

describe('GET /tiles/:layer/:z/:x/:y.pbf (ST_AsMVT)', () => {
  const eiffelTile = tileOf(2.2945, 48.8584, 14)

  it('returns a decodable vector tile with the POIs of that tile', async () => {
    const res = await request(app)
      .get(`/tiles/pois/14/${eiffelTile.x}/${eiffelTile.y}.pbf`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = []
        r.on('data', (c: Buffer) => chunks.push(c))
        r.on('end', () => cb(null, Buffer.concat(chunks)))
      })
      .expect(200)
    expect(res.headers['content-type']).toBe('application/vnd.mapbox-vector-tile')
    expect(res.headers['cache-control']).toMatch(/max-age=\d+/)
    const layer = new VectorTile(new PbfReader(res.body as Buffer)).layers.pois
    const tileNames = Array.from({ length: layer?.length ?? 0 }, (_, i) => layer?.feature(i).properties.name)
    expect(tileNames).toContain('Tour Eiffel')
    expect(tileNames).not.toContain('Ancien spot') // soft-deleted
  })

  it('204 for an empty tile and below the layer min zoom; 404 unknown layer; 400 impossible tile', async () => {
    await request(app).get('/tiles/pois/14/0/0.pbf').expect(204)
    const low = tileOf(2.2945, 48.8584, 9)
    await request(app).get(`/tiles/pois/9/${low.x}/${low.y}.pbf`).expect(204)
    expect((await request(app).get('/tiles/users/14/1/1.pbf').expect(404)).body.error.code).toBe('UNKNOWN_LAYER')
    expect((await request(app).get('/tiles/pois/3/9/1.pbf').expect(400)).body.error.code).toBe('INVALID_TILE')
  })
})

describe('spatial indexes', () => {
  // With a few thousand rows the planner must pick the GIST indexes; a changed cast or column in the SQL would
  // silently fall back to scanning every POI.
  beforeEach(async () => {
    await seedBulk({ pois: 3000, photosPerPoi: 0 })
  })

  it('radius search uses idx_pois_geog', async () => {
    const [sql, params] = await firstQueryOf(() =>
      poiRepository.nearby({ lng: 2.2945, lat: 48.8584, radius: 300, limit: 50 }),
    )
    expect((await planNodes(sql, params)).map((n) => n['Index Name'])).toContain('idx_pois_geog')
  })

  it('polygon search uses idx_pois_geom', async () => {
    const polygonGeoJson = JSON.stringify({ type: 'Polygon', coordinates: [REGION_7E.ring] })
    const [sql, params] = await firstQueryOf(() => poiRepository.within({ polygonGeoJson, limit: 50 }))
    expect((await planNodes(sql, params)).map((n) => n['Index Name'])).toContain('idx_pois_geom')
  })
})
