import { describe, expect, it } from 'vitest'
import {
  countPolygonVertices,
  haversineMeters,
  isInBBox,
  isValidLngLat,
  isValidTile,
  SUPPORTED_SPOT_BBOX,
  type LngLat,
} from './geo.js'

const EIFFEL: LngLat = [2.2945, 48.8584]
const NOTRE_DAME: LngLat = [2.3499, 48.853]
const GIVERNY: LngLat = [1.5336, 49.0757]
const LYON: LngLat = [4.8357, 45.764]

describe('isValidLngLat', () => {
  it('accepts coordinates in range, including the limits', () => {
    expect(isValidLngLat(EIFFEL)).toBe(true)
    expect(isValidLngLat([-180, -90])).toBe(true)
    expect(isValidLngLat([180, 90])).toBe(true)
  })

  it('rejects out-of-range and non-finite values', () => {
    expect(isValidLngLat([181, 0])).toBe(false)
    expect(isValidLngLat([0, -91])).toBe(false)
    expect(isValidLngLat([Number.NaN, 48])).toBe(false)
    expect(isValidLngLat([2, Number.POSITIVE_INFINITY])).toBe(false)
  })
})

describe('isInBBox / SUPPORTED_SPOT_BBOX', () => {
  it('covers Paris and the day trips just outside Île-de-France', () => {
    expect(isInBBox(EIFFEL, SUPPORTED_SPOT_BBOX)).toBe(true)
    expect(isInBBox(GIVERNY, SUPPORTED_SPOT_BBOX)).toBe(true)
  })

  it('excludes places outside the region', () => {
    expect(isInBBox(LYON, SUPPORTED_SPOT_BBOX)).toBe(false)
  })

  it('includes points on the edges', () => {
    expect(isInBBox([0.8, 47.9], SUPPORTED_SPOT_BBOX)).toBe(true)
    expect(isInBBox([4.0, 49.5], SUPPORTED_SPOT_BBOX)).toBe(true)
  })
})

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(EIFFEL, EIFFEL)).toBe(0)
  })

  it('gives the known Eiffel Tower → Notre-Dame distance (~4.1 km)', () => {
    expect(haversineMeters(EIFFEL, NOTRE_DAME)).toBeGreaterThan(4_000)
    expect(haversineMeters(EIFFEL, NOTRE_DAME)).toBeLessThan(4_200)
  })

  it('is symmetric', () => {
    expect(haversineMeters(EIFFEL, GIVERNY)).toBeCloseTo(haversineMeters(GIVERNY, EIFFEL), 6)
  })
})

describe('isValidTile', () => {
  it('accepts tiles inside the zoom level grid', () => {
    expect(isValidTile(0, 0, 0)).toBe(true)
    expect(isValidTile(12, 2074, 1409)).toBe(true)
  })

  it('rejects coordinates outside the grid, negative or non-integer values', () => {
    expect(isValidTile(1, 2, 0)).toBe(false)
    expect(isValidTile(3, -1, 0)).toBe(false)
    expect(isValidTile(2.5, 0, 0)).toBe(false)
    expect(isValidTile(23, 0, 0)).toBe(false)
  })
})

describe('countPolygonVertices', () => {
  it('counts every ring, holes included', () => {
    const outer = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ]
    const hole = [
      [0.2, 0.2],
      [0.4, 0.2],
      [0.2, 0.4],
      [0.2, 0.2],
    ]
    expect(countPolygonVertices([outer, hole])).toBe(8)
  })
})
