import { DEFAULT_LOCALE, isLocale, type Locale } from './translate'

const STORAGE_KEY = 'pmv.locale'

// Priority: ?lang= (shareable links) > remembered choice > Vietnamese default.
// Browser language is intentionally ignored: Vietnamese is the product default.
export function resolveInitialLocale(search: string): Locale {
  const fromUrl = new URLSearchParams(search).get('lang')
  if (isLocale(fromUrl)) return fromUrl
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isLocale(stored)) return stored
  } catch {
    // Storage can be blocked (private mode); the default locale is fine.
  }
  return DEFAULT_LOCALE
}

export function rememberLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Not persisting is acceptable; the locale still applies for this session.
  }
}
