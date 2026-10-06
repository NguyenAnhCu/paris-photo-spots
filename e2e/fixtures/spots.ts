// Spots seeded before every spec file: real Paris places covering the 8 photo categories, so maps and lists look like
// the real app. Three spots near the Louvre sit close enough to cluster at the default zoom; the others stand alone.
export type SpotKey =
  | 'eiffel'
  | 'louvre'
  | 'tuileries'
  | 'vivienne'
  | 'pontNeuf'
  | 'sacreCoeur'
  | 'cremieux'
  | 'montparnasse'
  | 'buttesChaumont'
  | 'luxembourg'
  | 'versailles'
  | 'quaiBranly'
  | 'deleted'

export type SpotFixture = {
  key: SpotKey
  name: string // OSM name (French)
  category: string
  photoCategory: string | null // null: kept in the DB but never shown
  at: [number, number] // [lng, lat]
  bestTime?: 'sunrise' | 'early_morning' | 'midday' | 'late_afternoon' | 'sunset'
  tip?: string
  nameI18n?: Partial<Record<'vi' | 'en' | 'fr', string>>
  cover?: boolean
  deleted?: boolean
}

// Answered by the network fixture with a local image (e2e/support/test.ts): no request leaves the machine.
export const COMMONS_COVER = 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Tour_Eiffel.jpg'

export const SPOTS: SpotFixture[] = [
  {
    key: 'eiffel',
    name: 'Tour Eiffel',
    category: 'monument',
    photoCategory: 'landmark',
    at: [2.2945, 48.8584],
    bestTime: 'sunset',
    tip: 'Đứng ở Trocadéro để thấy cả tháp.',
    nameI18n: { vi: 'Tháp Eiffel', en: 'Eiffel Tower', fr: 'Tour Eiffel' },
    cover: true,
  },
  {
    key: 'louvre',
    name: 'Musée du Louvre',
    category: 'museum',
    photoCategory: 'landmark',
    at: [2.3376, 48.8606],
    bestTime: 'early_morning',
    nameI18n: { vi: 'Bảo tàng Louvre', en: 'Louvre Museum', fr: 'Musée du Louvre' },
    cover: true,
  },
  {
    key: 'tuileries',
    name: 'Jardin des Tuileries',
    category: 'park_garden',
    photoCategory: 'park',
    at: [2.3275, 48.8635],
    nameI18n: { vi: 'Vườn Tuileries', en: 'Tuileries Garden' },
  },
  {
    key: 'vivienne',
    name: 'Galerie Vivienne',
    category: 'neighborhood_walk',
    photoCategory: 'street',
    at: [2.3398, 48.8662],
  },
  {
    key: 'pontNeuf',
    name: 'Pont Neuf',
    category: 'monument',
    photoCategory: 'bridge',
    at: [2.3412, 48.8572],
    bestTime: 'late_afternoon',
    nameI18n: { vi: 'Cầu Pont Neuf', en: 'Pont Neuf' },
  },
  {
    key: 'sacreCoeur',
    name: 'Basilique du Sacré-Cœur',
    category: 'viewpoint',
    photoCategory: 'skyline',
    at: [2.3431, 48.8867],
    bestTime: 'sunrise',
    nameI18n: { vi: 'Vương cung thánh đường Sacré-Cœur', en: 'Sacré-Cœur Basilica' },
    cover: true,
  },
  // Wikidata labels are sentence case ("rue Crémieux"); the app shows them as titles ("Rue Crémieux").
  {
    key: 'cremieux',
    name: 'Rue Crémieux',
    category: 'neighborhood_walk',
    photoCategory: 'street',
    at: [2.3708, 48.8473],
    bestTime: 'late_afternoon',
    nameI18n: { vi: 'phố Crémieux', en: 'rue Crémieux', fr: 'rue Crémieux' },
  },
  {
    key: 'montparnasse',
    name: 'Tour Montparnasse',
    category: 'viewpoint',
    photoCategory: 'rooftop',
    at: [2.3221, 48.8421],
    bestTime: 'sunset',
  },
  {
    key: 'buttesChaumont',
    name: 'Parc des Buttes-Chaumont',
    category: 'park_garden',
    photoCategory: 'wedding',
    at: [2.3828, 48.8809],
  },
  {
    key: 'luxembourg',
    name: 'Jardin du Luxembourg',
    category: 'park_garden',
    photoCategory: 'park',
    at: [2.3372, 48.8462],
    bestTime: 'midday',
  },
  {
    key: 'versailles',
    name: 'Château de Versailles',
    category: 'day_trip',
    photoCategory: 'suburb',
    at: [2.1204, 48.8049],
    nameI18n: { vi: 'Cung điện Versailles', en: 'Palace of Versailles' },
  },
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

export const VISIBLE_SPOTS = SPOTS.filter((s) => s.photoCategory && !s.deleted)

export const STOPS = [
  { key: 'birHakeim', name: 'Bir-Hakeim', modes: ['metro'], lines: ['6'], zone: 1, at: [2.2894, 48.8539] },
  { key: 'chatelet', name: 'Châtelet', modes: ['metro'], lines: ['1', '4'], zone: 1, at: [2.347, 48.8584] },
] as const
