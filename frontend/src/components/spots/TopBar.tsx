import { CirclePlus, MapPin, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useMatch } from 'react-router-dom'
import { useSpotFilters } from '../../hooks/useSpotFilters'
import { useI18n } from '../../i18n/I18nContext'
import { categoryLabelKey } from '../../i18n/keys'
import { useSpotNav } from '../../pages/mapUi'
import { SPOT_CATEGORIES } from '../../types/spot'
import { LanguageSwitcher } from '../LanguageSwitcher/LanguageSwitcher'
import { CategoryChip, PillButton } from '../ui'
import './TopBar.css'

// "/" focuses search from anywhere, unless the user is already typing in a field.
export function useSlashToSearch(input: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [input])
}

export function SearchField({ variant }: { variant: 'bar' | 'column' }) {
  const { t } = useI18n()
  const { query, setQuery } = useSpotFilters()
  const nav = useSpotNav()
  const onList = useMatch('/')
  const ref = useRef<HTMLInputElement>(null)
  useSlashToSearch(ref)
  return (
    <label className={`search search--${variant}`}>
      <span className="visually-hidden">{t('search.label')}</span>
      <Search size={18} strokeWidth={2} aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        value={query}
        placeholder={t('search.placeholder')}
        onChange={(e) => {
          setQuery(e.target.value)
          // Desktop design: typing a search brings you back to the list view.
          if (variant === 'bar' && !onList) nav.toList()
        }}
      />
    </label>
  )
}

export function FilterControl({ variant }: { variant: 'bar' | 'column' }) {
  const { t } = useI18n()
  const { category, setCategory } = useSpotFilters()
  const [open, setOpen] = useState(false)
  const popoverId = useId()
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (variant === 'bar' && wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open, variant])

  const label = category === 'all' ? t('filter.button') : t(categoryLabelKey(category))
  return (
    <div className={`filter filter--${variant}`} ref={wrap}>
      <PillButton
        variant="tonal"
        icon={SlidersHorizontal}
        className={['filter__button', category !== 'all' && 'pill--active'].filter(Boolean).join(' ')}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="filter__label">{label}</span>
      </PillButton>
      {open && (
        <div id={popoverId} className="filter__popover" role="group" aria-label={t('filter.label')}>
          {(['all', ...SPOT_CATEGORIES] as const).map((c) => (
            <CategoryChip
              key={c}
              category={c}
              selected={category === c}
              onSelect={() => {
                setCategory(c)
                setOpen(false)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  const { t } = useI18n()
  const nav = useSpotNav()
  return (
    <>
      <div className="topbar">
        <div className="topbar__pill glass">
          <button type="button" className="topbar__brand" onClick={nav.toList} aria-label={t('app.home')}>
            <span className="topbar__logo" aria-hidden="true">
              <MapPin size={20} strokeWidth={2} />
            </span>
            <span className="topbar__name">{t('app.name')}</span>
          </button>
          <SearchField variant="bar" />
          <FilterControl variant="bar" />
        </div>
      </div>
      <div className="topbar__actions">
        <LanguageSwitcher />
        <PillButton variant="primary" size="lg" icon={CirclePlus} onClick={nav.toAdd}>
          {t('add.button')}
        </PillButton>
      </div>
    </>
  )
}
