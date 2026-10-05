// Pure geo helpers. All coordinates are [lng, lat] in EPSG:4326.

export type LngLat = [lng: number, lat: number]
export type BBox = [minLng: number, minLat: number, maxLng: number, maxLat: number]

export const ILE_DE_FRANCE_BBOX: BBox = [1.4462, 48.1205, 3.559, 49.2415]

// Where new photo spots may be created: Île-de-France plus a margin for day trips just outside it (Giverny, Chantilly).
// Same box as the frontend map's maxBounds.
export const SUPPORTED_SPOT_BBOX: BBox = [0.8, 47.9, 4.0, 49.5]

const EARTH_RADIUS_M = 6_371_008.8

export function isValidLngLat([lng, lat]: LngLat): boolean {
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
}

export function isInBBox([lng, lat]: LngLat, [minLng, minLat, maxLng, maxLat]: BBox): boolean {
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
}

export function haversineMeters(a: LngLat, b: LngLat): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

export function isValidTile(z: number, x: number, y: number, maxZoom = 22): boolean {
  if (![z, x, y].every(Number.isInteger)) return false
  if (z < 0 || z > maxZoom) return false
  const n = 2 ** z
  return x >= 0 && x < n && y >= 0 && y < n
}

export function countPolygonVertices(coordinates: number[][][]): number {
  return coordinates.reduce((sum, ring) => sum + ring.length, 0)
}
