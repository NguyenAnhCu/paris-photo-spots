import { ArrowLeft, Camera, Clock, Cloud, Images, Users, X } from 'lucide-react'
import { useEffect } from 'react'
import { mediaUrl } from '@/api/client'
import { useSpot, useSpotPhotos, useWeather } from '@/hooks/useSpots'
import { useI18n } from '@/i18n/useI18n'
import { translateApiError } from '@/i18n/apiError'
import { bestTimeKey, categoryLabelKey, crowdLabelKey, weatherKey } from '@/i18n/keys'
import { formatCoords } from '@/lib/geo'
import { useMapUi, useSpotNav } from '@/pages/mapUi'
import type { SpotDetail as Spot } from '@/types/spot'
import { IconButton, Photo, PillButton, StatTile, Tag } from '@/components/ui'
import { useCrowdNow } from '@/hooks/useCrowdNow'
import { CrowdChart } from './CrowdChart'
import { ExifPills } from './ExifPills'
import { CommunityPhotos } from './PhotoGallery'
import { StateMessage } from './StateMessage'
import './SpotDetail.css'

const COMMUNITY_PREVIEW = 3

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onEscape()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEscape])
}

function WeatherValue({ lat, lng }: { lat: number; lng: number }) {
  const { t } = useI18n()
  const weather = useWeather(lat, lng)
  if (weather.isPending) return <>{t('common.loading')}</>
  if (weather.isError) return <>{t('detail.weatherError')}</>
  return <>{t('weather.value', { temp: weather.data.tempC, label: t(weatherKey(weather.data.kind)) })}</>
}

function DetailBody({ spot, layout }: { spot: Spot; layout: 'panel' | 'page' }) {
  const { t } = useI18n()
  const nav = useSpotNav()
  const sunset = spot.photoCategory === 'skyline' || spot.bestTime === 'sunset'
  const crowd = useCrowdNow(spot.id, spot.crowdLevel, sunset)
  const photos = useSpotPhotos(spot.id)
  const latest = photos.data?.pages[0]?.items ?? []
  const withExif = latest.find((p) => p.focal || p.aperture || p.shutter || p.iso)
  const stacked = layout === 'page'

  return (
    <>
      <div className="detail__stats">
        <StatTile
          stacked={stacked}
          icon={Users}
          label={`${t('detail.crowd')} · ${t('detail.estimate')}`}
          value={t(crowdLabelKey(crowd.label))}
        />
        <StatTile stacked={stacked} icon={Clock} label={t('detail.bestTime')} value={t(bestTimeKey(spot.bestTime))} />
        <StatTile
          stacked={stacked}
          icon={Cloud}
          label={t('detail.weather')}
          value={<WeatherValue lat={spot.lat} lng={spot.lng} />}
        />
      </div>
      <CrowdChart {...crowd} />
      <p className="detail__tip">{spot.tip || t('detail.noTip')}</p>
      {withExif && <ExifPills photo={withExif} />}
      <div className="detail__community">
        <div className="detail__thumbs">
          {Array.from({ length: COMMUNITY_PREVIEW }, (_, i) => {
            const p = latest[i]
            return (
              <Photo
                key={p?.id ?? i}
                src={p ? mediaUrl(p.thumbUrl) : null}
                alt={p ? t('photos.alt', { name: spot.name, author: p.authorName || t('photos.anonymous') }) : ''}
                className="detail__thumb"
              />
            )
          })}
        </div>
        <div className="detail__actions">
          {spot.photoCount > 0 && (
            <PillButton variant="tonal" icon={Images} onClick={() => nav.toPhotos(spot.id)}>
              {t('detail.viewPhotos', { count: spot.photoCount })}
            </PillButton>
          )}
          <PillButton variant="clay" icon={Camera} onClick={() => nav.toAddPhoto(spot.id)}>
            {t('detail.addPhoto')}
          </PillButton>
        </div>
      </div>
    </>
  )
}

function Hero({ spot, compact }: { spot: Spot; compact?: boolean }) {
  const { t } = useI18n()
  return (
    <div className={compact ? 'detail-hero detail-hero--compact' : 'detail-hero'}>
      <Photo src={spot.cover?.url ?? null} alt={spot.name} className="detail-hero__photo" loading="eager" />
      <div className="detail-hero__caption">
        <Tag tone="paper">{t(categoryLabelKey(spot.photoCategory))}</Tag>
        <h1>{spot.name}</h1>
        <span className="mono detail-hero__coords">{formatCoords(spot.lat, spot.lng)}</span>
      </div>
    </div>
  )
}

export function PhotoCredit({ spot }: { spot: Spot }) {
  const { t } = useI18n()
  if (!spot.cover?.attribution) return null
  const text = t('detail.photoCredit', { attribution: spot.cover.attribution })
  return spot.cover.pageUrl ? (
    <a className="photo-credit" href={spot.cover.pageUrl} target="_blank" rel="noreferrer noopener" title={text}>
      {text}
    </a>
  ) : (
    <span className="photo-credit" title={text}>
      {text}
    </span>
  )
}

// Detail and community photos share one panel (design): `view` switches the body, the photos view gets a shorter hero.
export function SpotPanel({
  spotId,
  layout,
  view,
}: {
  spotId: string
  layout: 'panel' | 'page'
  view: 'detail' | 'photos'
}) {
  const { t } = useI18n()
  const nav = useSpotNav()
  const { focusSpot } = useMapUi()
  const { data: spot, isPending, isError, error, refetch } = useSpot(spotId)
  useEscape(layout === 'panel' ? nav.toList : () => undefined)

  useEffect(() => {
    if (spot) focusSpot(spot)
    // Fly once per opened spot, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot?.id])

  const content = isPending ? (
    <StateMessage>{t('common.loading')}</StateMessage>
  ) : isError || !spot ? (
    <StateMessage onRetry={() => refetch()}>{translateApiError(error, t)}</StateMessage>
  ) : null

  if (layout === 'panel') {
    return (
      <section className="panel panel--solid detail" aria-label={spot?.name ?? t('common.loading')}>
        {spot && <Hero spot={spot} compact={view === 'photos'} />}
        <div className="detail__float-actions">
          {view === 'photos' ? (
            <PillButton variant="white" icon={ArrowLeft} onClick={() => nav.toSpot(spotId)}>
              {t('detail.backToInfo')}
            </PillButton>
          ) : (
            <span />
          )}
          <IconButton icon={X} label={t('common.close')} onClick={nav.toList} />
        </div>
        <div className="panel__scroll detail__body">
          {content}
          {spot && <PhotoCredit spot={spot} />}
          {spot && view === 'detail' && <DetailBody spot={spot} layout="panel" />}
          {spot && view === 'photos' && <CommunityPhotos spot={spot} columns={4} />}
        </div>
      </section>
    )
  }

  return (
    <div className="column">
      <div className="column__inner detail-page">
        <div className="detail-page__top">
          <PillButton
            variant="tonal"
            icon={ArrowLeft}
            onClick={view === 'photos' ? () => nav.toSpot(spotId) : nav.toList}
          >
            {view === 'photos' && spot ? spot.name : t('nav.allSpots')}
          </PillButton>
          {spot && view === 'detail' && <Tag>{t(categoryLabelKey(spot.photoCategory))}</Tag>}
          {spot && view === 'photos' && (
            <span className="detail-page__count">{t('photos.count', { count: spot.photoCount })}</span>
          )}
        </div>
        {content}
        {spot && view === 'detail' && (
          <>
            <Photo src={spot.cover?.url ?? null} alt={spot.name} className="detail-page__hero" loading="eager" />
            <PhotoCredit spot={spot} />
            <div>
              <h1 className="detail-page__title">{spot.name}</h1>
              <span className="mono detail-page__coords">{formatCoords(spot.lat, spot.lng)}</span>
            </div>
            <DetailBody spot={spot} layout="page" />
          </>
        )}
        {spot && view === 'photos' && (
          <>
            <h1 className="detail-page__title">{t('photos.title')}</h1>
            <CommunityPhotos spot={spot} columns={3} />
          </>
        )}
      </div>
    </div>
  )
}
