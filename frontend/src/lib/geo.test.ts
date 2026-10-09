import { describe, expect, it } from 'vitest'
import {
  circlePolygon,
  formatCoords,
  haversineMeters,
  isInBBox,
  isValidLngLat,
  roundBBox,
  viewBoundsAt,
  type LngLat,
} from './geo'

const EIFFEL: LngLat = [2.2945, 48.8584]
const NOTRE_DAME: LngLat = [2.3499, 48.853]

describe('geo', () => {
  it('validates [lng, lat] ranges', () => {
    expect(isValidLngLat(EIFFEL)).toBe(true)
    expect(isValidLngLat([48.8584, 2.2945])).toBe(true) // swapped but still in range: order is the caller's job
    expect(isValidLngLat([181, 0])).toBe(false)
    expect(isValidLngLat([0, -91])).toBe(false)
    expect(isValidLngLat([Number.NaN, 0])).toBe(false)
  })

  it('checks bbox membership inclusively', () => {
    const box = [2, 48, 3, 49] as const
    expect(isInBBox(EIFFEL, [...box])).toBe(true)
    expect(isInBBox([2, 48], [...box])).toBe(true)
    expect(isInBBox([1.99, 48.5], [...box])).toBe(false)
  })

  it('formats coordinates lat first for people', () => {
    expect(formatCoords(48.85837, 2.294481)).toBe('48.8584, 2.2945')
    expect(formatCoords(48.85837, 2.294481, 2)).toBe('48.86, 2.29')
  })

  it('measures great-circle distance (Eiffel Tower → Notre-Dame ≈ 4.1 km)', () => {
    const d = haversineMeters(EIFFEL, NOTRE_DAME)
    expect(d).toBeGreaterThan(4_000)
    expect(d).toBeLessThan(4_200)
    expect(haversineMeters(EIFFEL, EIFFEL)).toBe(0)
  })

  it('rounds a bbox so query keys stay stable', () => {
    expect(roundBBox([2.29451, 48.85837, 2.34991, 48.85301])).toEqual([2.295, 48.858, 2.35, 48.853])
  })

  it('draws a closed circle whose points sit at the radius', () => {
    const polygon = circlePolygon(EIFFEL, 500, 16)
    const ring = polygon.coordinates[0] ?? []
    expect(ring).toHaveLength(17)
    expect(ring[0]).toEqual(ring[16])
    for (const p of ring) expect(haversineMeters(EIFFEL, p as LngLat)).toBeCloseTo(500, -1)
  })
})

describe('viewBoundsAt (the map area before the map has loaded)', () => {
  it('desktop 1440 × 900, zoom 12 on central Paris, panel 456 px: the area right of the panel', () => {
    const [w, s, e, n] = viewBoundsAt({
      center: [2.3322, 48.8566],
      zoom: 12,
      width: 1440,
      height: 900,
      leftPadding: 456,
    })
    // 512-px tiles: 360° / (512 · 2^12) per pixel; the centre sits in the middle of the uncovered area.
    const perPx = 360 / (512 * 2 ** 12)
    expect(w).toBeCloseTo(2.3322 - 492 * perPx, 6)
    expect(e).toBeCloseTo(2.3322 + 492 * perPx, 6)
    expect(s).toBeLessThan(48.8566)
    expect(n).toBeGreaterThan(48.8566)
    // Mercator: north of the centre takes a little less latitude than south.
    expect(n - 48.8566).toBeLessThan(48.8566 - s)
    expect(n - s).toBeCloseTo(900 * perPx * Math.cos((48.8566 * Math.PI) / 180), 3)
  })

  it('phone without a panel: centred on the middle of the screen', () => {
    const [w, , e] = viewBoundsAt({ center: [2.3322, 48.8566], zoom: 12, width: 390, height: 844, leftPadding: 0 })
    expect((w + e) / 2).toBeCloseTo(2.3322, 6)
  })

  it('a panel wider than the map is ignored (whole map counts)', () => {
    const a = viewBoundsAt({ center: [2.3, 48.8], zoom: 12, width: 300, height: 600, leftPadding: 456 })
    const b = viewBoundsAt({ center: [2.3, 48.8], zoom: 12, width: 300, height: 600, leftPadding: 0 })
    expect(a).toEqual(b)
  })
})
