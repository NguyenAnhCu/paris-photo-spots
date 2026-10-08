import { useI18n } from '@/i18n/useI18n'
import { bestTimeKey, categoryLabelKey } from '@/i18n/keys'
import type { SpotSummary } from '@/types/spot'
import { Photo, Tag } from '@/components/ui'
import '@/components/moderation/moderation.css'
import './SpotCard.css'

type SpotCardProps = {
  spot: SpotSummary
  variant: 'overlay' | 'stacked' // desktop panel: text over photo · tablet/mobile grid: photo on top
  active: boolean
  onOpen: () => void
  onHover?: (id: string | null) => void
}

export function SpotCard({ spot, variant, active, onOpen, onHover }: SpotCardProps) {
  const { t } = useI18n()
  const category = t(categoryLabelKey(spot.photoCategory))
  const best = t(bestTimeKey(spot.bestTime))
  const hover = onHover ? { onMouseEnter: () => onHover(spot.id), onMouseLeave: () => onHover(null) } : {}

  if (variant === 'overlay') {
    return (
      <button
        type="button"
        className="spot-card spot-card--overlay"
        data-active={active}
        onClick={onOpen}
        onFocus={() => onHover?.(spot.id)}
        onBlur={() => onHover?.(null)}
        {...hover}
      >
        <Photo src={spot.coverThumbUrl} alt="" className="spot-card__photo" />
        <span className="spot-card__caption">
          <span className="spot-card__name">{spot.name}</span>
          {/* Most imported spots have no curated best time: show the category alone rather than "Giờ đẹp: Chưa rõ". */}
          <span className="spot-card__meta">{spot.bestTime ? t('card.meta', { category, time: best }) : category}</span>
          {spot.pending && <span className="status-chip spot-card__pending">{t('status.pending')}</span>}
        </span>
      </button>
    )
  }

  return (
    <button type="button" className="spot-card spot-card--stacked" data-active={active} onClick={onOpen} {...hover}>
      <span className="spot-card__media">
        <Photo src={spot.coverThumbUrl} alt="" className="spot-card__photo" />
        <Tag tone="paper" className="spot-card__category">
          {category}
        </Tag>
      </span>
      <span className="spot-card__body">
        <span className="spot-card__name">{spot.name}</span>
        {(spot.bestTime || spot.pending) && (
          <span className="spot-card__tags">
            {spot.pending && <span className="status-chip">{t('status.pending')}</span>}
            {spot.bestTime && <Tag tone="neutral">{best}</Tag>}
          </span>
        )}
      </span>
    </button>
  )
}
