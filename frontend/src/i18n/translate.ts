import { en } from './messages/en'
import { fr } from './messages/fr'
import { vi, type MessageKey, type Messages } from './messages/vi'

export const LOCALES = ['vi', 'en', 'fr'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'vi'

// Each language names itself, so the switcher stays readable whatever the current locale.
export const LOCALE_NAMES: Record<Locale, string> = { vi: 'Tiếng Việt', en: 'English', fr: 'Français' }

const CATALOGS: Record<Locale, Messages> = { vi, en, fr }

export type TranslateParams = Record<string, string | number>
export type Translate = (key: MessageKey, params?: TranslateParams) => string

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export function createTranslator(locale: Locale): Translate {
  const catalog = CATALOGS[locale]
  return (key, params) => {
    const template = catalog[key] ?? vi[key] ?? key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
  }
}

export function hasMessage(key: string): key is MessageKey {
  return key in vi
}
