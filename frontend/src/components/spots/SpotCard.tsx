import { useI18n } from '../../i18n/I18nContext'
import { bestTimeKey, categoryLabelKey, crowdLabelKey } from '../../i18n/keys'
import { CROWD_LEVEL_LABEL } from '../../lib/crowd'
import type { SpotSummary } from '../../types/spot'
import { Photo, Tag } from '../ui'
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
  const crowd = t(crowdLabelKey(CROWD_LEVEL_LABEL[spot.crowdLevel]))
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
        <span className={`spot-card__crowd spot-card__crowd--${spot.crowdLevel}`}>{crowd}</span>
        <span className="spot-card__caption">
          <span className="spot-card__name">{spot.name}</span>
          {/* Most imported spots have no curated best time: show the category alone rather than "Giờ đẹp: Chưa rõ". */}
          <span className="spot-card__meta">{spot.bestTime ? t('card.meta', { category, time: best }) : category}</span>
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
        <span className="spot-card__tags">
          <Tag tone={`crowd-${spot.crowdLevel}`}>{crowd}</Tag>
          {spot.bestTime && <Tag tone="neutral">{best}</Tag>}
        </span>
      </span>
    </button>
  )
}
