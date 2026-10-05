import { useMemo } from 'react'
import { busiestHour, clampToProfileHour, crowdLabelAt, crowdProfile, seedFromId, type CrowdLabel } from '@/lib/crowd'
import type { CrowdLevel } from '@/types/spot'

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
