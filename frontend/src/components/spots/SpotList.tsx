import { useMemo } from 'react'
import { config } from '@/config'
import { useIncrementalList } from '@/hooks/useIncrementalList'
import { useSpotFilters, useFilteredSpots } from '@/hooks/useSpotFilters'
import { useSpots } from '@/hooks/useSpots'
import { useI18n } from '@/i18n/useI18n'
import { translateApiError } from '@/i18n/apiError'
import { spotsForList } from '@/lib/listScope'
import { useMapUi, useSpotNav } from '@/pages/mapUi'
import { PillButton, Tag } from '@/components/ui'
import { SpotCard } from './SpotCard'
import { CardSkeletons, StateMessage } from './StateMessage'
import { FilterControl, SearchField } from './TopBar'
import './SpotList.css'

// Desktop: glass panel with overlay cards. Tablet/mobile: content column with title, search, filter and card grid.
// Lists the spots in the visible map area (a search looks everywhere), 20 cards at a time.
export function SpotList({ layout }: { layout: 'panel' | 'column' }) {
  const { t } = useI18n()
  const { data, isPending, isError, error, refetch } = useSpots()
  const { category, query, active, clear } = useSpotFilters()
  const visible = useFilteredSpots(data, category, query)
  const { hoverId, setHoverId, viewBounds, listScope, setListScope } = useMapUi()
  const searching = query.trim() !== ''
  const listed = useMemo(
    () => spotsForList(visible, { bounds: viewBounds, scope: listScope, searching }),
    [visible, viewBounds, listScope, searching],
  )
  const { shown, hasMore, remaining, loadMore, sentinelRef } = useIncrementalList(listed, config.listPageSize)
  const inViewOnly = !searching && listScope === 'view' && viewBounds !== null
  const showAll = (
    <PillButton variant="tonal" onClick={() => setListScope('all')}>
      {t('list.showAll', { count: visible.length })}
    </PillButton>
  )
  const nav = useSpotNav()
  const variant = layout === 'panel' ? 'overlay' : 'stacked'

  const body = isPending ? (
    <CardSkeletons count={4} variant={variant} />
  ) : isError ? (
    <StateMessage onRetry={() => refetch()}>{`${t('list.error')} ${translateApiError(error, t)}`}</StateMessage>
  ) : listed.length === 0 && visible.length > 0 && inViewOnly ? (
    <StateMessage action={showAll}>{t('list.emptyInView')}</StateMessage>
  ) : listed.length === 0 ? (
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
    <>
      {shown.map((f) => (
        <SpotCard
          key={f.properties.id}
          spot={f.properties}
          variant={variant}
          active={hoverId === f.properties.id}
          onOpen={() => nav.toSpot(f.properties.id)}
          onHover={layout === 'panel' ? setHoverId : undefined}
        />
      ))}
      {hasMore && (
        // Comes into view near the end of the list → next cards (the button is for keyboard users).
        <div ref={sentinelRef} className="spot-list__more">
          <PillButton variant="tonal" onClick={loadMore}>
            {t('list.more', { count: remaining })}
          </PillButton>
        </div>
      )}
    </>
  )
  const count = t('list.count', { count: listed.length })
  const scope =
    isPending || isError ? null : (
      <p className="spot-list__scope">
        <span>{t(searching ? 'list.scope.search' : inViewOnly ? 'list.scope.view' : 'list.scope.all')}</span>
        {!searching &&
          viewBounds !== null &&
          (listScope === 'view' ? (
            visible.length > listed.length &&
            listed.length > 0 && (
              <button type="button" className="spot-list__scope-link" onClick={() => setListScope('all')}>
                {t('list.showAll', { count: visible.length })}
              </button>
            )
          ) : (
            <button type="button" className="spot-list__scope-link" onClick={() => setListScope('view')}>
              {t('list.onlyInView')}
            </button>
          ))}
      </p>
    )

  if (layout === 'panel') {
    return (
      <section className="panel panel--glass spot-list" aria-labelledby="spot-list-title">
        <header className="spot-list__header">
          <h2 id="spot-list-title">{t('list.title')}</h2>
          <Tag>{count}</Tag>
        </header>
        {scope}
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
        {scope}
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
