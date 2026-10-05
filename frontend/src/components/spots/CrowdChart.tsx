import { useMemo } from 'react'
import { useI18n } from '../../i18n/I18nContext'
import { crowdLabelKey } from '../../i18n/keys'
import { busiestHour, clampToProfileHour, crowdLabelAt, crowdProfile, seedFromId, type CrowdLabel } from '../../lib/crowd'
import type { CrowdLevel } from '../../types/spot'

const AXIS_HOURS = [6, 9, 12, 15, 18, 21]
const MIN_BAR_PX = 8
const MAX_BAR_EXTRA_PX = 48
const PARIS_TZ = 'Europe/Paris'

// The spots are in Paris: "now" is Paris time even when planning from abroad.
export function parisHour(date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: PARIS_TZ }).format(date))
}

export function useCrowdNow(spotId: string, crowdLevel: CrowdLevel, sunsetPeak: boolean) {
  return useMemo(() => {
    const profile = crowdProfile(crowdLevel, sunsetPeak, seedFromId(spotId))
    const hour = clampToProfileHour(parisHour())
    return { profile, hour, label: crowdLabelAt(profile, hour) as CrowdLabel, peak: busiestHour(profile) }
  }, [spotId, crowdLevel, sunsetPeak])
}

type CrowdChartProps = { profile: ReturnType<typeof crowdProfile>; hour: number; label: CrowdLabel; peak: number }

export function CrowdChart({ profile, hour, label, peak }: CrowdChartProps) {
  const { t } = useI18n()
  const summary = t('detail.crowdChartSummary', { peak, label: t(crowdLabelKey(label)).toLowerCase() })
  return (
    <figure className="crowd-chart">
      <figcaption className="crowd-chart__head">
        <span className="crowd-chart__title">
          {t('detail.crowdChart')} <span className="crowd-chart__estimate">({t('detail.estimate')})</span>
        </span>
        <span className="crowd-chart__now">{t('detail.crowdNow', { hour })}</span>
      </figcaption>
      {/* Bars are decorative for screen readers; the summary sentence carries the information. */}
      <div className="crowd-chart__bars" role="img" aria-label={summary}>
        {profile.map((p) => (
          <span
            key={p.hour}
            className="crowd-chart__bar"
            data-now={p.hour === hour}
            style={{ height: `${Math.round(MIN_BAR_PX + p.level * MAX_BAR_EXTRA_PX)}px` }}
          />
        ))}
      </div>
      <div className="crowd-chart__axis mono" aria-hidden="true">
        {AXIS_HOURS.map((h) => (
          <span key={h}>{h}h</span>
        ))}
      </div>
    </figure>
  )
}
