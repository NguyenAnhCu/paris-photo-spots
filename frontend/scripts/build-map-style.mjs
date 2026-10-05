// Builds public/map-style.json: OpenFreeMap "positron" (free, no key) recoloured to the Paris Photo Spots palette.
// Replaces the prototype's CSS filter on raster tiles (filters don't port to native apps, raster tiles blur past z16).
// Usage: node scripts/build-map-style.mjs   — re-run when OpenFreeMap updates its style; commit the output.
import { writeFile } from 'node:fs/promises'

const SOURCE = 'https://tiles.openfreemap.org/styles/positron'
const OUT = new URL('../public/map-style.json', import.meta.url)

// Warm paper map. Raw colours are allowed here (MapLibre cannot read CSS variables) — keep in sync with tokens.css.
const C = {
  land: '#efebe4',
  residential: '#ebe6de',
  park: '#e1e3d3',
  wood: '#dcdfcd',
  water: '#c9d5de',
  waterLabel: '#5f7a8f',
  building: '#e3dcd1',
  buildingOutline: '#d6cdbf',
  roadCasing: '#dcd3c6',
  road: '#fbf9f5',
  roadMajor: '#f7f1e7',
  roadSubtle: '#e9e2d7',
  rail: '#cdc4b6',
  aeroway: '#e6e0d6',
  boundary: '#c2b7a8',
  label: '#6b6158',
  labelStrong: '#4a433c',
  halo: '#f5f2ed',
  ice: '#f2efea',
}

const set = (layer, prop, value) => {
  layer.paint = { ...(layer.paint ?? {}), [prop]: value }
}

function recolor(layer) {
  const id = layer.id
  switch (layer.type) {
    case 'background':
      set(layer, 'background-color', C.land)
      return
    case 'fill':
      if (id === 'park') set(layer, 'fill-color', C.park)
      else if (id.startsWith('landcover_wood')) set(layer, 'fill-color', C.wood)
      else if (id === 'water') set(layer, 'fill-color', C.water)
      else if (id.startsWith('landuse_residential')) set(layer, 'fill-color', C.residential)
      else if (id === 'building') {
        set(layer, 'fill-color', C.building)
        set(layer, 'fill-outline-color', C.buildingOutline)
      } else if (id.startsWith('aeroway') || id.startsWith('road_area')) set(layer, 'fill-color', C.aeroway)
      else if (id.startsWith('landcover_ice') || id.startsWith('landcover_glacier')) set(layer, 'fill-color', C.ice)
      return
    case 'line':
      if (id.startsWith('waterway')) set(layer, 'line-color', C.water)
      else if (id.startsWith('boundary')) set(layer, 'line-color', C.boundary)
      else if (id.startsWith('railway') || id.includes('rail')) set(layer, 'line-color', C.rail)
      else if (id.includes('casing')) set(layer, 'line-color', C.roadCasing)
      else if (id.includes('subtle')) set(layer, 'line-color', C.roadSubtle)
      else if (id.includes('motorway') || id.includes('major')) set(layer, 'line-color', C.roadMajor)
      else if (id.startsWith('highway') || id.startsWith('road') || id.startsWith('tunnel')) set(layer, 'line-color', C.road)
      else if (id.startsWith('aeroway')) set(layer, 'line-color', C.aeroway)
      return
    case 'symbol': {
      const water = id.startsWith('water')
      const city = id.startsWith('label_city') || id.startsWith('label_country')
      set(layer, 'text-color', water ? C.waterLabel : city ? C.labelStrong : C.label)
      set(layer, 'text-halo-color', C.halo)
      return
    }
  }
}

const res = await fetch(SOURCE, { headers: { 'User-Agent': 'paris-map-view/0.1 (style build)' } })
if (!res.ok) throw new Error(`Cannot download ${SOURCE}: HTTP ${res.status}`)
const style = await res.json()
style.name = 'Paris Photo Spots — warm (from OpenFreeMap positron)'
// Highway shields and airport icons compete with our photo pins; drop them.
style.layers = style.layers.filter((l) => !/shield|^airport$/.test(l.id))
style.layers.forEach(recolor)
await writeFile(OUT, JSON.stringify(style))
console.log(`Wrote ${OUT.pathname}: ${style.layers.length} layers`)
