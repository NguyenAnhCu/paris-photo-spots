import type pg from 'pg'
import type { ImportContext } from '../context.js'
import { fetchJsonCached } from '../cache.js'
import { assertNoShrink, assertNonEmpty, count, newStats, upsertOutcome, type SourceStats } from '../guards.js'

const BASE = 'https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets'
// Bus stops are excluded on purpose (34k points, little value for visitors).
const RAIL_TYPES = ['metro', 'rail', 'tram', 'cableway']
export const STOP_ID_PREFIX = 'IDFM:zda:'

type Arret = {
  arrid: string
  zdaid: string
  arrname: string
  arrtype: string
  arrfarezone: string | null
  arraccessibility: string | null
  arrgeopoint: { lon: number; lat: number } | null
}
type ArretLigne = { stop_id: string; shortname: string | null; mode: string }

const MODE_BY_LINE_MODE: Record<string, string> = {
  Metro: 'metro',
  RapidTransit: 'rer',
  LocalTrain: 'train',
  regionalRail: 'train',
  RailShuttle: 'train',
  Tramway: 'tram',
  CableWay: 'cable',
  Funicular: 'funicular',
}
const MODE_BY_ARRTYPE: Record<string, string> = { metro: 'metro', rail: 'train', tram: 'tram', cableway: 'cable' }

function lineLabel(mode: string, shortname: string): string {
  if (mode === 'metro') return `M${shortname}`
  if (mode === 'rer') return `RER ${shortname}`
  return shortname
}

type Station = {
  zdaid: string
  name: string
  lngs: number[]
  lats: number[]
  arrtypes: Set<string>
  modes: Set<string>
  lines: Set<string>
  zones: number[]
  wheelchair: boolean | null
}

function addLine(st: Station, l: ArretLigne) {
  const mode = MODE_BY_LINE_MODE[l.mode] ?? l.mode.toLowerCase()
  st.modes.add(mode)
  if (l.shortname) st.lines.add(lineLabel(mode, l.shortname))
}

const nonEmptyArray = (name: string) => (rows: unknown[]) => assertNonEmpty(name, Array.isArray(rows) ? rows.length : 0)

export async function importTransitStops(client: pg.ClientBase, ctx: ImportContext): Promise<SourceStats> {
  const where = `arrtype in (${RAIL_TYPES.map((t) => `"${t}"`).join(',')})`
  const arrets = await fetchJsonCached<Arret[]>(
    ctx,
    'idfm-arrets-rail.json',
    `${BASE}/arrets/exports/json?where=${encodeURIComponent(where)}`,
    undefined,
    nonEmptyArray('idfm-arrets'),
  )
  const lignes = await fetchJsonCached<ArretLigne[]>(
    ctx,
    'idfm-arrets-lignes-rail.json',
    `${BASE}/arrets-lignes/exports/json?where=${encodeURIComponent('mode != "Bus"')}&select=stop_id,shortname,mode`,
    undefined,
    nonEmptyArray('idfm-arrets-lignes'),
  )
  await assertNoShrink(client, ctx, 'transit_stops', arrets.length)

  // arrets-lignes uses two id kinds: "IDFM:<arrid>" (a quay — métro/tram) and
  // "IDFM:monomodalStopPlace:<zdaid>" (a whole station — mostly RER/Transilien). Verified 2026-10-02.
  const linesByArret = new Map<string, ArretLigne[]>()
  const linesByZda = new Map<string, ArretLigne[]>()
  for (const l of lignes) {
    const zda = l.stop_id.match(/^IDFM:monomodalStopPlace:(\w+)$/)?.[1]
    const target = zda ? linesByZda : linesByArret
    const key = zda ?? l.stop_id.replace(/^IDFM:/, '')
    target.set(key, [...(target.get(key) ?? []), l])
  }

  // `arrets` are individual platforms/quays; a station ("zone d'arrêt") groups them under one zdaid.
  const stations = new Map<string, Station>()
  for (const a of arrets) {
    if (!a.arrgeopoint) continue
    const st = stations.get(a.zdaid) ?? {
      zdaid: a.zdaid,
      name: a.arrname,
      lngs: [],
      lats: [],
      arrtypes: new Set<string>(),
      modes: new Set<string>(),
      lines: new Set<string>(),
      zones: [],
      wheelchair: null,
    }
    st.lngs.push(a.arrgeopoint.lon)
    st.lats.push(a.arrgeopoint.lat)
    const zone = Number(a.arrfarezone)
    if (Number.isInteger(zone) && zone > 0) st.zones.push(zone)
    if (a.arraccessibility === 'true') st.wheelchair = true
    else if (a.arraccessibility === 'false' && st.wheelchair === null) st.wheelchair = false

    st.arrtypes.add(a.arrtype)
    for (const l of linesByArret.get(a.arrid) ?? []) addLine(st, l)
    stations.set(a.zdaid, st)
  }
  for (const st of stations.values()) {
    for (const l of linesByZda.get(st.zdaid) ?? []) addLine(st, l)
    // No line data at all (~2% of stations): fall back to the coarse stop type.
    if (st.modes.size === 0) for (const t of st.arrtypes) st.modes.add(MODE_BY_ARRTYPE[t] ?? t)
  }

  const stats = newStats(arrets.length)
  const ids: string[] = []
  for (const st of stations.values()) {
    const id = `${STOP_ID_PREFIX}${st.zdaid}`
    ids.push(id)
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    const { rows } = await client.query<{ inserted: boolean }>(
      `INSERT INTO transit_stops (gtfs_stop_id, name, modes, lines, navigo_zone, wheelchair, geom)
       VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326))
       ON CONFLICT (gtfs_stop_id) WHERE deleted_at IS NULL
       DO UPDATE SET name = EXCLUDED.name, modes = EXCLUDED.modes, lines = EXCLUDED.lines,
                     navigo_zone = EXCLUDED.navigo_zone, wheelchair = EXCLUDED.wheelchair, geom = EXCLUDED.geom
       WHERE (transit_stops.name, transit_stops.modes, transit_stops.lines, transit_stops.navigo_zone,
              transit_stops.wheelchair, transit_stops.geom)
             IS DISTINCT FROM
             (EXCLUDED.name, EXCLUDED.modes, EXCLUDED.lines, EXCLUDED.navigo_zone, EXCLUDED.wheelchair, EXCLUDED.geom)
       RETURNING (xmax = 0) AS inserted`,
      [
        id,
        st.name,
        [...st.modes].sort(),
        [...st.lines].sort(),
        st.zones.length ? Math.min(...st.zones) : null,
        st.wheelchair,
        avg(st.lngs),
        avg(st.lats),
      ],
    )
    count(stats, upsertOutcome(rows))
  }

  // Stations that disappeared from the source are soft-deleted, never hard-deleted.
  const { rowCount } = await client.query(
    `UPDATE transit_stops SET deleted_at = NOW()
     WHERE deleted_at IS NULL AND gtfs_stop_id LIKE $1 AND NOT (gtfs_stop_id = ANY($2))`,
    [`${STOP_ID_PREFIX}%`, ids],
  )
  stats.softDeleted = rowCount ?? 0
  return stats
}
