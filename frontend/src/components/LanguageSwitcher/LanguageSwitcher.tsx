import { Languages } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { LOCALE_NAMES, LOCALES, isLocale } from '@/i18n/translate'
import './LanguageSwitcher.css'

// Not in the design (Vietnamese-only prototype); styled as a tonal pill to blend in. Each language names itself.
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()
  return (
    <label className="lang-switch">
      <span className="visually-hidden">{t('language.label')}</span>
      <Languages size={16} strokeWidth={2} aria-hidden="true" />
      <select
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value)
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  )
}
