import { describe, expect, it } from 'vitest'
import { circlePolygon, formatCoords, haversineMeters, isInBBox, isValidLngLat, roundBBox, type LngLat } from './geo'

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
