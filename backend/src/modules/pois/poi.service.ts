import { env } from '../../config/env.js'
import { AppError } from '../../lib/errors.js'
import { countPolygonVertices } from '../../lib/geo.js'
import { poiRepository, type PoiFeature } from './poi.repository.js'
import type { InRegionQuery, NearbyQuery, WithinBody } from './poi.schemas.js'

const featureCollection = (features: PoiFeature[]) => ({ type: 'FeatureCollection' as const, features })

export const poiService = {
  async nearby(query: NearbyQuery) {
    return featureCollection(await poiRepository.nearby(query))
  },

  async within(body: WithinBody) {
    const rings = body.polygon.type === 'Polygon' ? body.polygon.coordinates : body.polygon.coordinates.flat()
    const vertices = countPolygonVertices(rings)
    if (vertices > env.MAX_POLYGON_VERTICES) {
      throw new AppError('POLYGON_TOO_COMPLEX', 400, `Polygon has ${vertices} vertices, max ${env.MAX_POLYGON_VERTICES}`)
    }
    return featureCollection(
      await poiRepository.within({
        polygonGeoJson: JSON.stringify(body.polygon),
        categories: body.categories,
        limit: body.limit,
      }),
    )
  },

  async inRegion(query: InRegionQuery) {
    return featureCollection(
      await poiRepository.inRegion({ regionCode: query.region_code, categories: query.categories, limit: query.limit }),
    )
  },

  async byId(id: string) {
    const poi = await poiRepository.byId(id)
    if (!poi) throw new AppError('POI_NOT_FOUND', 404, 'POI not found')
    return poi
  },
}
