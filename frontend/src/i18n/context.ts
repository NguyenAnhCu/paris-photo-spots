import { createContext } from 'react'
import type { Locale, Translate } from './translate'

export type I18nContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: Translate }

export const I18nContext = createContext<I18nContextValue | null>(null)
