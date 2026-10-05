import { z } from 'zod'
import { env } from '../../config/env.js'

export const POI_CATEGORIES = [
  'monument',
  'museum',
  'park_garden',
  'viewpoint',
  'church_religious',
  'market_food',
  'cafe_bistro',
  'neighborhood_walk',
  'day_trip',
  'event_venue',
  'experience',
] as const
export type PoiCategory = (typeof POI_CATEGORIES)[number]

const categoriesParam = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((c) => c.trim()) : undefined))
  .pipe(z.array(z.enum(POI_CATEGORIES)).optional())

const limit = z.coerce.number().int().min(1).max(env.MAX_RESULTS).default(100)

export const NearbyQuery = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  radius: z.coerce.number().int().min(1).max(env.MAX_RADIUS_M),
  categories: categoriesParam,
  limit,
})
export type NearbyQuery = z.infer<typeof NearbyQuery>

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
const linearRing = z.array(position).min(4)

export const GeoJsonPolygon = z.union([
  z.object({ type: z.literal('Polygon'), coordinates: z.array(linearRing).min(1) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(linearRing).min(1)).min(1) }),
])
export type GeoJsonPolygon = z.infer<typeof GeoJsonPolygon>

export const WithinBody = z.object({
  polygon: GeoJsonPolygon,
  categories: z.array(z.enum(POI_CATEGORIES)).optional(),
  limit,
})
export type WithinBody = z.infer<typeof WithinBody>

export const InRegionQuery = z.object({
  region_code: z.string().min(1),
  categories: categoriesParam,
  limit,
})
export type InRegionQuery = z.infer<typeof InRegionQuery>

export const IdQuery = z.object({ id: z.string().uuid() })
