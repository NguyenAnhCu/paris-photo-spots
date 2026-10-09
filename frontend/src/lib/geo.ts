import type { Polygon, Position } from 'geojson'

// All coordinates are [lng, lat] in EPSG:4326.
export type LngLat = [lng: number, lat: number]
export type BBox = [minLng: number, minLat: number, maxLng: number, maxLat: number]

const EARTH_RADIUS_M = 6_371_008.8

export function isValidLngLat([lng, lat]: LngLat): boolean {
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
}

export function isInBBox([lng, lat]: LngLat, [minLng, minLat, maxLng, maxLat]: BBox): boolean {
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
}

// Display only ("48.8638, 2.3136"): people read lat first; code keeps [lng, lat] everywhere else.
export function formatCoords(lat: number, lng: number, decimals = 4): string {
  return `${lat.toFixed(decimals)}, ${lng.toFixed(decimals)}`
}

export function haversineMeters(a: LngLat, b: LngLat): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

// Rounding keeps TanStack Query keys stable across sub-pixel pans.
export function roundBBox(bbox: BBox, decimals = 3): BBox {
  const f = 10 ** decimals
  return bbox.map((v) => Math.round(v * f) / f) as BBox
}

// Approximate circle polygon for drawing a search radius on the map.
export function circlePolygon(center: LngLat, radiusM: number, steps = 64): Polygon {
  const [lng, lat] = center
  const dLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI)
  const dLng = dLat / Math.cos((lat * Math.PI) / 180)
  const ring: Position[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)])
  }
  return { type: 'Polygon', coordinates: [ring] }
}

// The area a MapLibre map shows (512-px tiles, Web Mercator, no rotation) for a camera and a container size, with the
// left `leftPadding` pixels covered (desktop panel). Lets the list match the map area before the map chunk has loaded.
export function viewBoundsAt(opts: {
  center: LngLat
  zoom: number
  width: number
  height: number
  leftPadding: number
}): BBox {
  const { center, zoom, width, height } = opts
  const left = opts.leftPadding < width ? opts.leftPadding : 0
  const worldPx = 512 * 2 ** zoom
  const toX = (lng: number) => ((lng + 180) / 360) * worldPx
  const toY = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180)
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldPx
  }
  const fromX = (x: number) => (x / worldPx) * 360 - 180
  const fromY = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldPx))) * 180) / Math.PI
  // Padding moves the camera centre to the middle of the uncovered area.
  const cx = toX(center[0])
  const cy = toY(center[1])
  const half = (width - left) / 2
  return [fromX(cx - half), fromY(cy + height / 2), fromX(cx + half), fromY(cy - height / 2)]
}
