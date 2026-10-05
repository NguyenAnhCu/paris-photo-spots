import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext } from './context'
import { rememberLocale, resolveInitialLocale } from './locale'
import { createTranslator, type Locale } from './translate'

export function I18nProvider({ initialLocale, children }: { initialLocale?: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? resolveInitialLocale(window.location.search))

  const setLocale = useCallback((next: Locale) => {
    rememberLocale(next)
    setLocaleState(next)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    // Keep an explicit ?lang= in sync so a shared link opens in the language currently shown.
    const url = new URL(window.location.href)
    if (url.searchParams.has('lang') && url.searchParams.get('lang') !== locale) {
      url.searchParams.set('lang', locale)
      window.history.replaceState(null, '', url)
    }
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale, t: createTranslator(locale) }), [locale, setLocale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

