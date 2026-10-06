import { beforeEach, describe, expect, it, vi } from 'vitest'
import { poiRepository } from './poi.repository.js'
import { poiService } from './poi.service.js'

vi.mock('./poi.repository.js', () => ({
  poiRepository: { nearby: vi.fn(), within: vi.fn(), inRegion: vi.fn(), byId: vi.fn() },
}))
const repo = vi.mocked(poiRepository)

// A closed ring with n vertices (first = last).
const ring = (n: number) => {
  const pts = Array.from(
    { length: n - 1 },
    (_, i) => [2.3 + Math.cos(i) / 100, 48.85 + Math.sin(i) / 100] as [number, number],
  )
  return [...pts, pts[0] as [number, number]]
}

beforeEach(() => vi.resetAllMocks())

describe('poiService.within', () => {
  it('passes the polygon to SQL as GeoJSON text and wraps the result in a FeatureCollection', async () => {
    repo.within.mockResolvedValue([])
    const polygon = { type: 'Polygon' as const, coordinates: [ring(5)] }
    expect(await poiService.within({ polygon, limit: 100 })).toEqual({ type: 'FeatureCollection', features: [] })
    expect(repo.within).toHaveBeenCalledWith({
      polygonGeoJson: JSON.stringify(polygon),
      categories: undefined,
      limit: 100,
    })
  })

  it('refuses polygons above MAX_POLYGON_VERTICES (1000), MultiPolygon parts included', async () => {
    const big = { type: 'MultiPolygon' as const, coordinates: [[ring(600)], [ring(500)]] }
    await expect(poiService.within({ polygon: big, limit: 100 })).rejects.toMatchObject({
      code: 'POLYGON_TOO_COMPLEX',
      status: 400,
    })
    expect(repo.within).not.toHaveBeenCalled()
  })
})

describe('poiService.byId / inRegion', () => {
  it('answers 404 POI_NOT_FOUND for an unknown id', async () => {
    repo.byId.mockResolvedValue(null)
    await expect(poiService.byId('x')).rejects.toMatchObject({ code: 'POI_NOT_FOUND', status: 404 })
  })

  it('maps the snake_case query to the repository arguments', async () => {
    repo.inRegion.mockResolvedValue([])
    await poiService.inRegion({ region_code: '75056', categories: ['museum'], limit: 10 })
    expect(repo.inRegion).toHaveBeenCalledWith({ regionCode: '75056', categories: ['museum'], limit: 10 })
  })
})
