import { useSpotFilters, useFilteredSpots } from '../../hooks/useSpotFilters'
import { useSpots } from '../../hooks/useSpots'
import { useI18n } from '../../i18n/I18nContext'
import { translateApiError } from '../../i18n/apiError'
import { useMapUi, useSpotNav } from '../../pages/mapUi'
import { PillButton, Tag } from '../ui'
import { SpotCard } from './SpotCard'
import { CardSkeletons, StateMessage } from './StateMessage'
import { FilterControl, SearchField } from './TopBar'
import './SpotList.css'

// Desktop: glass panel with overlay cards. Tablet/mobile: content column with title, search, filter and card grid.
export function SpotList({ layout }: { layout: 'panel' | 'column' }) {
  const { t } = useI18n()
  const { data, isPending, isError, error, refetch } = useSpots()
  const { category, query, active, clear } = useSpotFilters()
  const visible = useFilteredSpots(data, category, query)
  const { hoverId, setHoverId } = useMapUi()
  const nav = useSpotNav()
  const variant = layout === 'panel' ? 'overlay' : 'stacked'

  const body = isPending ? (
    <CardSkeletons count={4} variant={variant} />
  ) : isError ? (
    <StateMessage onRetry={() => refetch()}>{`${t('list.error')} ${translateApiError(error, t)}`}</StateMessage>
  ) : visible.length === 0 ? (
    <StateMessage
      action={
        active && (
          <PillButton variant="tonal" onClick={clear}>
            {t('list.clearFilters')}
          </PillButton>
        )
      }
    >
      {t('list.empty')}
    </StateMessage>
  ) : (
    visible.map((f) => (
      <SpotCard
        key={f.properties.id}
        spot={f.properties}
        variant={variant}
        active={hoverId === f.properties.id}
        onOpen={() => nav.toSpot(f.properties.id)}
        onHover={layout === 'panel' ? setHoverId : undefined}
      />
    ))
  )
  const count = t('list.count', { count: visible.length })

  if (layout === 'panel') {
    return (
      <section className="panel panel--glass spot-list" aria-labelledby="spot-list-title">
        <header className="spot-list__header">
          <h2 id="spot-list-title">{t('list.title')}</h2>
          <Tag>{count}</Tag>
        </header>
        <div className="panel__scroll spot-list__items" aria-busy={isPending}>
          {body}
        </div>
      </section>
    )
  }

  return (
    <div className="column">
      <div className="column__inner column__inner--list">
        <header className="spot-list__col-header">
          <h1 id="spot-list-title">{t('list.title')}</h1>
          <span className="spot-list__count">{count}</span>
        </header>
        <div className="spot-list__controls">
          <SearchField variant="column" />
          <FilterControl variant="column" />
        </div>
        <div className="spot-list__grid" aria-busy={isPending}>
          {body}
        </div>
      </div>
    </div>
  )
}
