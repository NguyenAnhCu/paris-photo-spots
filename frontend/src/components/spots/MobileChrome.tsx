// Tablet/mobile chrome (< 1000px): header, floating "Danh sách | Bản đồ" switch, mini card, placement bar.
import { ArrowRight, CirclePlus, List, Map as MapIcon } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { bestTimeKey, categoryLabelKey, crowdLabelKey } from '@/i18n/keys'
import { CROWD_LEVEL_LABEL } from '@/lib/crowd'
import { formatCoords } from '@/lib/geo'
import { useMapUi, useSpotNav } from '@/pages/mapUi'
import type { SpotSummary } from '@/types/spot'
import { LanguageSwitcher } from '@/components/LanguageSwitcher/LanguageSwitcher'
import { Photo, PillButton } from '@/components/ui'
import './MobileChrome.css'

export function MobileHeader() {
  const { t } = useI18n()
  const nav = useSpotNav()
  const { setMobileTab } = useMapUi()
  return (
    <header className="m-header">
      <button
        type="button"
        className="m-header__brand"
        onClick={() => {
          setMobileTab('list')
          nav.toList()
        }}
      >
        {t('app.name')}
      </button>
      <div className="m-header__actions">
        <LanguageSwitcher />
        <PillButton variant="primary" icon={CirclePlus} onClick={nav.toAdd} className="m-header__add">
          {t('add.button')}
        </PillButton>
      </div>
    </header>
  )
}

export function BottomSegmented() {
  const { t } = useI18n()
  const { mobileTab, setMobileTab } = useMapUi()
  const tabs = [
    { id: 'list' as const, label: t('nav.list'), icon: List },
    { id: 'map' as const, label: t('nav.map'), icon: MapIcon },
  ]
  return (
    <div className="segmented-wrap">
      <div className="segmented" role="tablist" aria-label={t('nav.views')}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mobileTab === id}
            className="segmented__tab"
            onClick={() => setMobileTab(id)}
          >
            <Icon size={18} strokeWidth={2} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function MiniSpotCard({ spot, onOpen }: { spot: SpotSummary; onOpen: () => void }) {
  const { t } = useI18n()
  return (
    <button type="button" className="mini-card" onClick={onOpen} aria-label={t('card.open', { name: spot.name })}>
      <Photo src={spot.coverThumbUrl} alt="" className="mini-card__photo" />
      <span className="mini-card__text">
        <span className="mini-card__category">{t(categoryLabelKey(spot.photoCategory))}</span>
        <span className="mini-card__name">{spot.name}</span>
        <span className="mini-card__meta">
          {t(crowdLabelKey(CROWD_LEVEL_LABEL[spot.crowdLevel]))}
          {spot.bestTime && ` · ${t(bestTimeKey(spot.bestTime))}`}
        </span>
      </span>
      <ArrowRight size={20} strokeWidth={2} aria-hidden="true" className="mini-card__arrow" />
    </button>
  )
}

export function PlacingBar() {
  const { t } = useI18n()
  const { placement, setPlacement, setPickingOnMap } = useMapUi()
  const position = placement?.position ?? null
  // Cancel puts back the location the form had before the full-screen map opened.
  const [initial] = useState(position)
  const cancel = () => {
    setPlacement((cur) => (cur ? { ...cur, position: initial } : cur))
    setPickingOnMap(false)
  }
  return (
    <div className="placing-bar">
      <span className="placing-bar__text" role="status">
        {position ? formatCoords(position[1], position[0]) : t('add.locationTapHint')}
      </span>
      <PillButton variant="dark" onClick={cancel} className="placing-bar__cancel">
        {t('common.cancel')}
      </PillButton>
      <PillButton variant="primary" onClick={() => setPickingOnMap(false)} disabled={!position}>
        {t('add.locationDone')}
      </PillButton>
    </div>
  )
}
