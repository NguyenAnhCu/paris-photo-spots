// Small deterministic dataset for local dev, integration tests and E2E. Full imports (GTFS/OSM) live elsewhere.
import pg from 'pg'

type SeedStop = { gtfsId: string; name: string; modes: string[]; lines: string[]; zone: number; lng: number; lat: number }
type SeedPoi = { name: string; category: string; zone: number; stop: string; walk: number; lng: number; lat: number }

const STOPS: SeedStop[] = [
  { gtfsId: 'seed:bir-hakeim', name: 'Bir-Hakeim', modes: ['metro'], lines: ['6'], zone: 1, lng: 2.2894, lat: 48.8539 },
  { gtfsId: 'seed:palais-royal', name: 'Palais Royal - Musée du Louvre', modes: ['metro'], lines: ['1', '7'], zone: 1, lng: 2.3364, lat: 48.8625 },
  { gtfsId: 'seed:cite', name: 'Cité', modes: ['metro'], lines: ['4'], zone: 1, lng: 2.3470, lat: 48.8550 },
  { gtfsId: 'seed:abbesses', name: 'Abbesses', modes: ['metro'], lines: ['12'], zone: 1, lng: 2.3384, lat: 48.8845 },
  { gtfsId: 'seed:versailles-rg', name: 'Versailles Château Rive Gauche', modes: ['rer'], lines: ['C'], zone: 4, lng: 2.1290, lat: 48.8003 },
]

const POIS: SeedPoi[] = [
  { name: 'Tour Eiffel', category: 'monument', zone: 1, stop: 'seed:bir-hakeim', walk: 10, lng: 2.2945, lat: 48.8584 },
  { name: 'Musée du Louvre', category: 'museum', zone: 1, stop: 'seed:palais-royal', walk: 3, lng: 2.3376, lat: 48.8606 },
  { name: 'Notre-Dame de Paris', category: 'church_religious', zone: 1, stop: 'seed:cite', walk: 4, lng: 2.3499, lat: 48.8530 },
  { name: 'Jardin des Tuileries', category: 'park_garden', zone: 1, stop: 'seed:palais-royal', walk: 5, lng: 2.3275, lat: 48.8635 },
  { name: 'Sacré-Cœur', category: 'viewpoint', zone: 1, stop: 'seed:abbesses', walk: 8, lng: 2.3431, lat: 48.8867 },
  { name: 'Château de Versailles', category: 'day_trip', zone: 4, stop: 'seed:versailles-rg', walk: 10, lng: 2.1204, lat: 48.8049 },
]

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    const stopIds = new Map<string, string>()
    for (const s of STOPS) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO transit_stops (gtfs_stop_id, name, modes, lines, navigo_zone, geom)
         VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326))
         ON CONFLICT (gtfs_stop_id) WHERE deleted_at IS NULL DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [s.gtfsId, s.name, s.modes, s.lines, s.zone, s.lng, s.lat],
      )
      const row = rows[0]
      if (row) stopIds.set(s.gtfsId, row.id)
    }
    // Hard delete is deliberate here: re-seeding must be idempotent and seed rows are not user data.
    await client.query(`DELETE FROM pois WHERE source = 'seed'`)
    for (const p of POIS) {
      await client.query(
        `INSERT INTO pois (name, category, navigo_zone, nearest_stop_id, walk_minutes, source, geom)
         VALUES ($1, $2, $3, $4, $5, 'seed', ST_SetSRID(ST_MakePoint($6, $7), 4326))`,
        [p.name, p.category, p.zone, stopIds.get(p.stop) ?? null, p.walk, p.lng, p.lat],
      )
    }
    await client.query('COMMIT')
    console.log(`Seeded ${STOPS.length} stops, ${POIS.length} POIs`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
