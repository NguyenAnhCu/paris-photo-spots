import { describe, expect, it } from 'vitest'
import { CreateSpotBody, ListSpotsQuery, SpotItemQuery } from './spot.schemas.js'

const valid = { name: 'Pont Alexandre III', photo_category: 'bridge', lat: 48.8638, lng: 2.3135, lang: 'vi' }
const UUID = '2f1c4d6e-8a9b-4c3d-9e1f-0a2b3c4d5e6f'

describe('ListSpotsQuery / SpotItemQuery', () => {
  it('defaults the language to Vietnamese', () => {
    expect(ListSpotsQuery.parse({})).toEqual({ lang: 'vi' })
    expect(SpotItemQuery.parse({ id: UUID })).toEqual({ id: UUID, lang: 'vi' })
  })

  it('rejects unsupported languages and malformed ids', () => {
    expect(ListSpotsQuery.safeParse({ lang: 'de' }).success).toBe(false)
    expect(SpotItemQuery.safeParse({ id: '42' }).success).toBe(false)
  })
})

describe('CreateSpotBody', () => {
  it('accepts a complete spot and trims the name', () => {
    const parsed = CreateSpotBody.parse({ ...valid, name: '  Pont Alexandre III  ', tip: ' Lúc bình minh ' })
    expect(parsed.name).toBe('Pont Alexandre III')
    expect(parsed.tip).toBe('Lúc bình minh')
  })

  it('accepts a spot without a tip', () => {
    expect(CreateSpotBody.safeParse(valid).success).toBe(true)
  })

  it('rejects names that are too short (after trimming) or too long', () => {
    expect(CreateSpotBody.safeParse({ ...valid, name: '  ab ' }).success).toBe(false)
    expect(CreateSpotBody.safeParse({ ...valid, name: 'x'.repeat(121) }).success).toBe(false)
  })

  it('rejects categories outside the 8 photo categories', () => {
    expect(CreateSpotBody.safeParse({ ...valid, photo_category: 'museum' }).success).toBe(false)
  })

  it('rejects impossible coordinates and coordinates sent as strings', () => {
    expect(CreateSpotBody.safeParse({ ...valid, lat: 91 }).success).toBe(false)
    expect(CreateSpotBody.safeParse({ ...valid, lng: -181 }).success).toBe(false)
    expect(CreateSpotBody.safeParse({ ...valid, lat: '48.86' }).success).toBe(false)
  })

  it('rejects a tip longer than the limit', () => {
    expect(CreateSpotBody.safeParse({ ...valid, tip: 'x'.repeat(1001) }).success).toBe(false)
  })
})
