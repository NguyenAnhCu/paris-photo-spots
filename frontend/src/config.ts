import type { BBox, LngLat } from './lib/geo'

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  // Light, quiet vector style built from OpenFreeMap "positron" (no API key): scripts/build-map-style.mjs.
  mapStyleUrl: import.meta.env.VITE_MAP_STYLE_URL || '/map-style.json',
  defaultCenter: [2.3322, 48.8566] satisfies LngLat as LngLat, // design: map opens on central Paris
  defaultZoom: 12,
  spotZoom: 15, // design: opening a spot flies to zoom ≥ 15
  minZoom: 7,
  maxZoom: 19,
  // Île-de-France with a margin so day trips near the border (Giverny) stay reachable. Same box as the backend.
  maxBounds: [0.8, 47.9, 4.0, 49.5] satisfies BBox as BBox,
  // Breakpoints (px): desktop ≥ 1000 · tablet 820–999 · mobile < 820
  breakpoints: { desktop: 1000, tablet: 820 },
  weatherStaleMs: 10 * 60_000, // cache weather 10–15 min
  photosPageSize: 24,
}
