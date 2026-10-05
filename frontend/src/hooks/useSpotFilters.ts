import { useCallback, useDeferredValue, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/I18nContext'
import { categoryLabelKey } from '../i18n/keys'
import { matchesQuery } from '../lib/search'
import { SPOT_CATEGORIES, type SpotCategory, type SpotCollection } from '../types/spot'

const isCategory = (v: string | null): v is SpotCategory => SPOT_CATEGORIES.includes(v as SpotCategory)

// Filters live in the URL (?cat=&q=) so a filtered view can be shared and survives Back.
export function useSpotFilters() {
  const [params, setParams] = useSearchParams()
  const rawCat = params.get('cat')
  const category: SpotCategory | 'all' = isCategory(rawCat) ? rawCat : 'all'
  const query = params.get('q') ?? ''

  const update = useCallback(
    (key: 'cat' | 'q', value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value) next.set(key, value)
          else next.delete(key)
          return next
        },
        { replace: true }, // typing must not push one history entry per keystroke
      ),
    [setParams],
  )

  return {
    category,
    query,
    setCategory: (c: SpotCategory | 'all') => update('cat', c === 'all' ? null : c),
    setQuery: (q: string) => update('q', q || null),
    clear: () => setParams((prev) => { const next = new URLSearchParams(prev); next.delete('cat'); next.delete('q'); return next }, { replace: true }),
    active: category !== 'all' || query.trim() !== '',
  }
}

// Name and category label are searched, accent-insensitive; deferred so typing stays smooth with ~260 cards.
export function useFilteredSpots(collection: SpotCollection | undefined, category: SpotCategory | 'all', query: string) {
  const { t } = useI18n()
  const deferredQuery = useDeferredValue(query)
  return useMemo(() => {
    const features = collection?.features ?? []
    return features.filter((f) => {
      const p = f.properties
      if (category !== 'all' && p.photoCategory !== category) return false
      return matchesQuery(deferredQuery, [p.name, t(categoryLabelKey(p.photoCategory))])
    })
  }, [collection, category, deferredQuery, t])
}
