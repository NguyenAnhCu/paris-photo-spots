/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_TILES_BASE_URL?: string
  readonly VITE_BASEMAP_STYLE_URL?: string
  readonly VITE_MAP_STYLE_URL?: string
  // Cloudflare Turnstile site key; unset = no bot check (dev, E2E).
  readonly VITE_TURNSTILE_SITE_KEY?: string
}
