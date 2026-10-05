// Smoke test for the integration setup: the container is up, migrated, and the app talks to it.
import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'

afterAll(async () => {
  await pool.end()
})

describe('integration setup', () => {
  it('migrates the database (PostGIS enabled, tables present)', async () => {
    const { rows } = await pool.query<{ postgis: string; tables: string[] }>(
      `SELECT postgis_lib_version() AS postgis,
              array_agg(table_name::text ORDER BY table_name) AS tables
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('pois', 'photos', 'transit_stops', 'regions', 'import_runs')`,
    )
    expect(rows[0]?.postgis).toMatch(/^3\.4/)
    expect(rows[0]?.tables).toEqual(['import_runs', 'photos', 'pois', 'regions', 'transit_stops'])
  })

  it('GET /api/v1/health reaches the database', async () => {
    const res = await request(createApp()).get('/api/v1/health')
    expect(res.status).toBe(200)
  })
})
