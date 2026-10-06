// A fake internet for the import pipeline: every source the import downloads (boundaries, IDFM, Overpass, Muséofile,
// Wikidata SPARQL, Commons) answered from small, hand-checked data. Coordinates are real so the spatial steps
// (nearest station, Paris boundary, 300 m matching) behave as with the live data.
import type { LngLat } from '../../src/lib/geo.js'

// --- OpenStreetMap (Overpass) -------------------------------------------------------------------------------------

type OsmElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags: Record<string, string>
}

const node = (id: number, [lon, lat]: LngLat, tags: Record<string, string>): OsmElement => ({
  type: 'node',
  id,
  lat,
  lon,
  tags,
})
const way = (id: number, [lon, lat]: LngLat, tags: Record<string, string>): OsmElement => ({
  type: 'way',
  id,
  center: { lat, lon },
  tags,
})

// 13 elements → 12 POIs (the two Champs-Élysées segments share a QID and are merged).
export const OSM_ELEMENTS: OsmElement[] = [
  node(1, [2.2945, 48.8584], { name: 'Tour Eiffel', tourism: 'attraction', wikidata: 'Q9001' }),
  // Matches curated spot p1 (same name, < 300 m): curated category/tip win.
  way(2, [2.3135, 48.8637], { name: 'Pont Alexandre III', man_made: 'bridge', wikidata: 'Q9002' }),
  way(3, [2.3008, 48.8698], { name: 'Avenue des Champs-Élysées', highway: 'primary', wikidata: 'Q9003' }),
  way(4, [2.307, 48.8722], { name: 'Avenue des Champs-Élysées', highway: 'primary', wikidata: 'Q9003' }),
  // Same QID as the street, mapped as an attraction node: only one of the two may be shown (the street).
  node(5, [2.305, 48.871], { name: 'Avenue des Champs-Élysées', tourism: 'attraction', wikidata: 'Q9003' }),
  {
    type: 'relation',
    id: 6,
    center: { lat: 48.8462, lon: 2.3372 },
    tags: { name: 'Jardin du Luxembourg', leisure: 'park', wikidata: 'Q9006' },
  },
  // Day trip (real QID from day-trips.ts), outside Paris; also curated spot p9.
  way(7, [2.1204, 48.8049], {
    name: 'Château de Versailles',
    tourism: 'attraction',
    historic: 'castle',
    wikidata: 'Q2946',
  }),
  // QID of a person (the square's namesake): Wikidata coordinates are in Armenia → must not be trusted.
  node(8, [2.33, 48.85], { name: 'Square Test', leisure: 'garden', wikidata: 'Q9008' }),
  // No Wikidata → never a photo spot; enriched by Muséofile (M0001).
  node(9, [2.362, 48.8575], { name: 'Musée de Test', tourism: 'museum' }),
  // Too few Wikipedia editions (3 < landmark threshold 10).
  node(10, [2.355, 48.865], { name: 'Petit monument', historic: 'monument', wikidata: 'Q9010' }),
  way(11, [2.3594, 48.8497], { name: 'Pont de Sully', man_made: 'bridge', wikidata: 'Q9011' }),
  node(12, [2.3489, 48.858], { name: 'Tour Saint-Jacques', man_made: 'tower', wikidata: 'Q9012' }),
  // Outside the Paris boundary and popular → suburb.
  node(13, [2.3596, 48.9356], { name: 'Basilique de Saint-Denis', historic: 'church', wikidata: 'Q9013' }),
]

// --- Wikidata --------------------------------------------------------------------------------------------------------

type WikidataFixture = { sitelinks: number; coord: LngLat; image?: string; labels?: Record<string, string> }

export const WIKIDATA: Record<string, WikidataFixture> = {
  Q9001: {
    sitelinks: 180,
    coord: [2.2945, 48.8583],
    image: 'Tour Eiffel.jpg',
    labels: { vi: 'Tháp Eiffel', en: 'Eiffel Tower', fr: 'Tour Eiffel' },
  },
  Q9002: {
    sitelinks: 30,
    coord: [2.3136, 48.8638],
    image: 'Pont Alexandre III.jpg',
    labels: { en: 'Pont Alexandre III' },
  },
  Q9003: { sitelinks: 60, coord: [2.3036, 48.8711], image: 'Champs-Elysees.jpg', labels: { en: 'Champs-Élysées' } },
  Q9006: { sitelinks: 40, coord: [2.3371, 48.8462], image: 'Luxembourg.jpg', labels: { en: 'Luxembourg Garden' } },
  Q2946: { sitelinks: 90, coord: [2.1204, 48.8049], image: 'Versailles.jpg', labels: { en: 'Palace of Versailles' } },
  Q9008: { sitelinks: 70, coord: [44.5, 40.18], image: 'Singer portrait.jpg', labels: { en: 'A singer' } },
  Q9010: { sitelinks: 3, coord: [2.355, 48.865], image: 'Petit.jpg' },
  Q9011: { sitelinks: 12, coord: [2.3594, 48.8497], image: 'Pont de Sully.jpg' },
  Q9012: { sitelinks: 20, coord: [2.3489, 48.858], image: 'Tour Saint-Jacques.jpg' },
  Q9013: { sitelinks: 50, coord: [2.3596, 48.9356], image: 'Saint-Denis.jpg' },
}

// --- IDFM stations -----------------------------------------------------------------------------------------------

export const IDFM_ARRETS = [
  // Bir-Hakeim: two platforms of one station (zdaid 71) → one stop at their average position.
  {
    arrid: '1',
    zdaid: '71',
    arrname: 'Bir-Hakeim',
    arrtype: 'metro',
    arrfarezone: '1',
    arraccessibility: 'false',
    arrgeopoint: { lon: 2.2893, lat: 48.8539 },
  },
  {
    arrid: '2',
    zdaid: '71',
    arrname: 'Bir-Hakeim',
    arrtype: 'metro',
    arrfarezone: '1',
    arraccessibility: 'false',
    arrgeopoint: { lon: 2.2895, lat: 48.8539 },
  },
  {
    arrid: '3',
    zdaid: '72',
    arrname: 'Champs-Élysées - Clemenceau',
    arrtype: 'metro',
    arrfarezone: '1',
    arraccessibility: 'false',
    arrgeopoint: { lon: 2.3141, lat: 48.8676 },
  },
  {
    arrid: '4',
    zdaid: '73',
    arrname: 'Versailles Château Rive Gauche',
    arrtype: 'rail',
    arrfarezone: '4',
    arraccessibility: 'true',
    arrgeopoint: { lon: 2.1351, lat: 48.8001 },
  },
]
export const IDFM_LIGNES = [
  { stop_id: 'IDFM:1', shortname: '6', mode: 'Metro' },
  { stop_id: 'IDFM:3', shortname: '1', mode: 'Metro' },
  { stop_id: 'IDFM:3', shortname: '13', mode: 'Metro' },
  { stop_id: 'IDFM:monomodalStopPlace:73', shortname: 'C', mode: 'RapidTransit' },
]

// --- Boundaries --------------------------------------------------------------------------------------------------

const box = (minLng: number, minLat: number, maxLng: number, maxLat: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat],
    ],
  ],
})

export const ARRONDISSEMENTS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { c_arinsee: 75107, l_ar: '7ème Ardt', l_aroff: 'Palais-Bourbon' },
      geometry: box(2.289, 48.846, 2.33, 48.866),
    },
  ],
}

// Paris (75) is what photoSpots.ts uses to tell Paris from suburbs. Finistère (29) must be filtered out (not IDF).
export const DEPARTMENTS = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { code: '75', nom: 'Paris' }, geometry: box(2.22, 48.815, 2.47, 48.905) },
    { type: 'Feature', properties: { code: '78', nom: 'Yvelines' }, geometry: box(1.45, 48.44, 2.23, 49.09) },
    { type: 'Feature', properties: { code: '93', nom: 'Seine-Saint-Denis' }, geometry: box(2.28, 48.81, 2.61, 49.01) },
    { type: 'Feature', properties: { code: '29', nom: 'Finistère' }, geometry: box(-5.15, 47.7, -3.38, 48.76) },
  ],
}

// --- Muséofile ---------------------------------------------------------------------------------------------------

const q = (v: string) => `"${v}"`
const museofileRow = (cells: string[]) => cells.map(q).join('|')
// BOM + CRLF + quoted, pipe-separated — the shape of the real export.
export const MUSEOFILE_CSV =
  '\uFEFF' +
  [
    museofileRow(['Identifiant', 'Nom_officiel', 'Region', 'Coordonnees', 'URL', 'Atout']),
    // ~25 m from the OSM "Musée de Test": enriches it (website, museofile tag) instead of adding a duplicate.
    museofileRow([
      'M0001',
      'musée de Test',
      'Île-de-France',
      '48.8576, 2.3622',
      'www.musee-test.fr',
      'Collections test',
    ]),
    museofileRow(['M0002', 'musée du Nouveau monde', 'Île-de-France', '48.8400, 2.3000', '', 'Nouveau']),
    museofileRow(['M0003', 'musée breton', 'Bretagne', '48.1, -1.68', '', '']),
  ].join('\r\n') +
  '\r\n'

// --- Router ------------------------------------------------------------------------------------------------------

export type FakeNetOptions = {
  overpass?: unknown // replaces the Overpass JSON payload
  commonsStatus?: number // non-200 → the Commons step fails
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

function sparql(body: string): Response {
  const query = new URLSearchParams(body).get('query') ?? ''
  const qids = [...query.matchAll(/wd:(Q\d+)/g)].map((m) => m[1] ?? '')
  const bindings = qids.flatMap((qid) => {
    const w = WIKIDATA[qid]
    if (!w) return []
    const binding: Record<string, { value: string }> = {
      item: { value: `http://www.wikidata.org/entity/${qid}` },
      sitelinks: { value: String(w.sitelinks) },
      coord: { value: `Point(${w.coord[0]} ${w.coord[1]})` },
    }
    if (w.image)
      binding.image = { value: `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(w.image)}` }
    for (const [lang, label] of Object.entries(w.labels ?? {})) binding[lang] = { value: label }
    return [binding]
  })
  return json({ results: { bindings } })
}

export const commonsThumb = (file: string) => {
  const name = file.replace(/ /g, '_')
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}/1280px-${name}`
}

function commons(body: string, status: number): Response {
  if (status !== 200) return new Response('error', { status })
  const titles = (new URLSearchParams(body).get('titles') ?? '').split('|').filter(Boolean)
  const pages = Object.fromEntries(
    titles.map((title, i) => {
      const file = title.replace(/^File:/, '')
      return [
        String(-1 - i),
        {
          title,
          imageinfo: [
            {
              thumburl: `${commonsThumb(file)}?utm_source=test`,
              descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
              extmetadata: {
                Artist: { value: `<a href="https://commons.wikimedia.org/wiki/User:Author">Author of ${file}</a>` },
                LicenseShortName: { value: 'CC BY-SA 4.0' },
              },
            },
          ],
        },
      ]
    }),
  )
  return json({ query: { pages } })
}

// Returns a fetch() replacement plus the list of URLs it served (to assert "no network" on cached runs).
export function fakeNet(options: FakeNetOptions = {}) {
  const calls: string[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const body = typeof init?.body === 'string' ? init.body : ''
    calls.push(url)
    if (url.startsWith('https://opendata.paris.fr/')) return json(ARRONDISSEMENTS)
    if (url.startsWith('https://raw.githubusercontent.com/gregoiredavid/')) return json(DEPARTMENTS)
    if (url.includes('/arrets-lignes/exports/json')) return json(IDFM_LIGNES)
    if (url.includes('/arrets/exports/json')) return json(IDFM_ARRETS)
    if (url.startsWith('https://overpass-api.de/')) return json(options.overpass ?? { elements: OSM_ELEMENTS })
    if (url.endsWith('/museofile.csv')) return new Response(MUSEOFILE_CSV)
    if (url.startsWith('https://query.wikidata.org/sparql')) return sparql(body)
    if (url.startsWith('https://commons.wikimedia.org/w/api.php')) return commons(body, options.commonsStatus ?? 200)
    throw new Error(`fakeNet: unexpected request ${url}`)
  }
  return { fetch, calls }
}
