// Shapes of the `spots` / `photos` API after snake→camel conversion (api/client.ts).
// Mirrors the backend API contract (snake_case on the wire, camelCase here).
import type { FeatureCollection, Point } from 'geojson'

export const SPOT_CATEGORIES = ['landmark', 'street', 'skyline', 'bridge', 'park', 'rooftop', 'wedding', 'suburb'] as const
export type SpotCategory = (typeof SPOT_CATEGORIES)[number]

export type CrowdLevel = 1 | 2 | 3 // 1 Vắng · 2 Vừa · 3 Đông (estimate, set by the team)

export const BEST_TIMES = ['sunrise', 'early_morning', 'midday', 'late_afternoon', 'sunset'] as const
export type BestTime = (typeof BEST_TIMES)[number]

export type SpotSummary = {
  id: string
  name: string
  photoCategory: SpotCategory
  crowdLevel: CrowdLevel
  bestTime: BestTime | null
  coverThumbUrl: string | null
  photoCount: number
}

export type SpotCollection = FeatureCollection<Point, SpotSummary>

export type SpotDetail = {
  id: string
  name: string
  nameOriginal: string
  photoCategory: SpotCategory
  lng: number
  lat: number
  crowdLevel: CrowdLevel
  bestTime: BestTime | null
  tip: string | null
  cover: { url: string; pageUrl: string | null; attribution: string | null } | null
  photoCount: number
  userCreated: boolean
}

export type ExifSummary = {
  focal?: string // '35mm'
  aperture?: string // 'f/1.8'
  shutter?: string // '1/250s'
  iso?: string // '100'
  camera?: string // 'Sony ILCE-7M4 · FE 35mm F1.4 GM'
}

export type CommunityPhoto = {
  id: string
  spotId: string
  url: string
  thumbUrl: string
  width: number
  height: number
  authorName: string | null
  focal: string | null
  aperture: string | null
  shutter: string | null
  iso: string | null
  camera: string | null
  createdAt: string
}

export type Page<T> = { items: T[]; total: number; offset: number; limit: number; hasMore: boolean }
