// Known places with real coordinates, so spatial results can be checked by hand on a map.
import type { LngLat } from '../../src/lib/geo.js'

export type SpotKey = 'eiffel' | 'luxembourg' | 'alexandre' | 'cremieux' | 'quaiBranly' | 'deleted'
export type StopKey = 'birHakeim' | 'chatelet'

type SpotFixture = {
  key: SpotKey
  name: string
  category: string
  photoCategory: string | null
  at: LngLat
  popularity?: number
  nameI18n?: Record<string, string>
  cover?: string
  deleted?: boolean
}

const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel.jpg/1280px-Tour_Eiffel.jpg'

export const SPOTS: SpotFixture[] = [
  {
    key: 'eiffel',
    name: 'Tour Eiffel',
    category: 'monument',
    photoCategory: 'landmark',
    at: [2.2945, 48.8584],
    popularity: 300,
    nameI18n: { vi: 'Tháp Eiffel', en: 'Eiffel Tower', fr: 'Tour Eiffel' },
    cover: COMMONS,
  },
  {
    key: 'luxembourg',
    name: 'Jardin du Luxembourg',
    category: 'park_garden',
    photoCategory: 'park',
    at: [2.3372, 48.8462],
    popularity: 200,
  },
  {
    key: 'alexandre',
    name: 'Pont Alexandre III',
    category: 'monument',
    photoCategory: 'bridge',
    at: [2.3136, 48.8639],
    popularity: 150,
  },
  {
    key: 'cremieux',
    name: 'Rue Crémieux',
    category: 'neighborhood_walk',
    photoCategory: 'street',
    at: [2.3708, 48.8473],
  },
  // Kept in the DB but never shown as a spot: no photo category, or soft-deleted.
  { key: 'quaiBranly', name: 'Musée du quai Branly', category: 'museum', photoCategory: null, at: [2.2976, 48.8609] },
  {
    key: 'deleted',
    name: 'Ancien spot',
    category: 'monument',
    photoCategory: 'landmark',
    at: [2.35, 48.86],
    deleted: true,
  },
]

export const STOPS: { key: StopKey; name: string; modes: string[]; lines: string[]; zone: number; at: LngLat }[] = [
  { key: 'birHakeim', name: 'Bir-Hakeim', modes: ['metro'], lines: ['6'], zone: 1, at: [2.2894, 48.8539] },
  { key: 'chatelet', name: 'Châtelet', modes: ['metro'], lines: ['1', '4'], zone: 1, at: [2.347, 48.8584] },
]

// 7th arrondissement, simplified to a box around the Eiffel Tower and Pont Alexandre III.
export const REGION_7E = {
  code: '75107',
  name: 'Paris 7e',
  type: 'arrondissement',
  ring: [
    [2.289, 48.846],
    [2.33, 48.846],
    [2.33, 48.866],
    [2.289, 48.866],
    [2.289, 48.846],
  ] as LngLat[],
}

// A point inside the supported area but more than 2 km from any station above (walk_minutes stays NULL).
export const FAR_FROM_STATIONS: LngLat = [2.1, 48.95]
