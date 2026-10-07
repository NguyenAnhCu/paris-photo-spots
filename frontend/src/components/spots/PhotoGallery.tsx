import { ChevronLeft, ChevronRight, Flag, LayoutGrid } from 'lucide-react'
import { useEffect, useState } from 'react'
import { mediaUrl } from '@/api/client'
import { useSpotPhotos } from '@/hooks/useSpots'
import { useI18n } from '@/i18n/useI18n'
import { translateApiError } from '@/i18n/apiError'
import { relativeTime } from '@/lib/time'
import type { SpotDetail } from '@/types/spot'
import { IconButton, Photo, PillButton, Tag } from '@/components/ui'
import { ReportDialog } from '@/components/moderation/ReportDialog'
import type { MessageKey } from '@/i18n/messages/vi'
import { ExifPills } from './ExifPills'
import '@/components/moderation/moderation.css'
import { StateMessage } from './StateMessage'
import './PhotoGallery.css'

export function CommunityPhotos({ spot, columns }: { spot: SpotDetail; columns: 3 | 4 }) {
  const { t, locale } = useI18n()
  const { data, isPending, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useSpotPhotos(
    spot.id,
  )
  const photos = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? spot.photoCount
  const [index, setIndex] = useState<number | null>(null)
  const current = index !== null ? photos[index] : undefined
  const [reporting, setReporting] = useState<string | null>(null)

  // ←/→ browse, Esc back to the grid (the panel's own Esc then closes the spot).
  useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      // A dialog over the viewer (report) owns the keyboard.
      if (document.querySelector('[role="dialog"]')) return
      if (e.key === 'ArrowLeft') setIndex((i) => (i === null ? i : (i + photos.length - 1) % photos.length))
      if (e.key === 'ArrowRight') setIndex((i) => (i === null ? i : (i + 1) % photos.length))
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        setIndex(null)
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [index, photos.length])

  if (isPending) return <StateMessage>{t('common.loading')}</StateMessage>
  if (isError) return <StateMessage onRetry={() => refetch()}>{translateApiError(error, t)}</StateMessage>

  return (
    <div className="gallery">
      {columns === 4 && (
        <div className="gallery__head">
          <h2>{t('photos.title')}</h2>
          <Tag>{t('photos.count', { count: total })}</Tag>
        </div>
      )}
      {photos.length === 0 && <StateMessage>{t('photos.empty')}</StateMessage>}

      {current && index !== null ? (
        <div className="viewer">
          <Photo
            src={mediaUrl(current.url)}
            alt={t('photos.alt', { name: spot.name, author: current.authorName || t('photos.anonymous') })}
            className="viewer__photo"
            loading="eager"
          />
          <div className="viewer__meta">
            <div className="viewer__who">
              <b>{current.authorName || t('photos.anonymous')}</b>
              <span>{relativeTime(current.createdAt, locale)}</span>
              {current.status !== 'approved' && (
                <span className={`status-chip status-chip--${current.status}`}>
                  {t(`status.${current.status}` as MessageKey)}
                </span>
              )}
            </div>
            <div className="viewer__nav">
              <IconButton
                icon={ChevronLeft}
                label={t('photos.prev')}
                onClick={() => setIndex((index + photos.length - 1) % photos.length)}
              />
              <PillButton variant="tonal" icon={LayoutGrid} onClick={() => setIndex(null)}>
                {t('photos.grid')}
              </PillButton>
              <IconButton
                icon={ChevronRight}
                label={t('photos.next')}
                onClick={() => setIndex((index + 1) % photos.length)}
              />
            </div>
          </div>
          <ExifPills photo={current} />
          {current.status === 'approved' && (
            <PillButton variant="tonal" icon={Flag} onClick={() => setReporting(current.id)} className="viewer__report">
              {t('report.photo')}
            </PillButton>
          )}
        </div>
      ) : (
        <div className="gallery__grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="gallery__cell"
              onClick={() => setIndex(i)}
              aria-label={t('photos.open', { index: i + 1 })}
            >
              <Photo src={mediaUrl(p.thumbUrl)} alt="" className="gallery__thumb" />
              {p.status !== 'approved' && (
                <span className={`status-chip status-chip--${p.status} gallery__status`}>
                  {t(`status.${p.status}` as MessageKey)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {index === null && hasNextPage && (
        <PillButton variant="tonal" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? t('common.loading') : t('photos.loadMore')}
        </PillButton>
      )}
      {reporting && <ReportDialog target={{ type: 'photo', id: reporting }} onClose={() => setReporting(null)} />}
    </div>
  )
}
