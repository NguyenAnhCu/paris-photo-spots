import { describe, expect, it } from 'vitest'
import { NearbyQuery, WithinBody } from './poi.schemas.js'

const square = [
  [2.3, 48.85],
  [2.31, 48.85],
  [2.31, 48.86],
  [2.3, 48.85],
]

describe('NearbyQuery', () => {
  it('coerces query-string numbers and splits categories', () => {
    const parsed = NearbyQuery.parse({ lng: '2.29', lat: '48.85', radius: '500', categories: 'museum, monument' })
    expect(parsed).toMatchObject({ lng: 2.29, lat: 48.85, radius: 500, categories: ['museum', 'monument'], limit: 100 })
  })

  it('rejects a radius above MAX_RADIUS_M and unknown categories', () => {
    expect(NearbyQuery.safeParse({ lng: '2.29', lat: '48.85', radius: '5001' }).success).toBe(false)
    expect(NearbyQuery.safeParse({ lng: '2.29', lat: '48.85', radius: '500', categories: 'casino' }).success).toBe(
      false,
    )
  })
})

describe('WithinBody', () => {
  it('accepts Polygon and MultiPolygon', () => {
    expect(WithinBody.safeParse({ polygon: { type: 'Polygon', coordinates: [square] } }).success).toBe(true)
    expect(WithinBody.safeParse({ polygon: { type: 'MultiPolygon', coordinates: [[square]] } }).success).toBe(true)
  })

  it('rejects rings with fewer than 4 positions and other geometry types', () => {
    expect(WithinBody.safeParse({ polygon: { type: 'Polygon', coordinates: [square.slice(0, 3)] } }).success).toBe(
      false,
    )
    expect(WithinBody.safeParse({ polygon: { type: 'Point', coordinates: [2.3, 48.85] } }).success).toBe(false)
  })
})
