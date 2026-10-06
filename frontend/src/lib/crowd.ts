// Simulated hourly crowd profile (no real data source yet — the UI must label it "ước tính" / estimate).
// Formula from the design spec: Gaussian around 14h (σ 4.2), scaled by crowdLevel/3, extra peak at 19h for sunset
// spots, small deterministic per-spot jitter. The thresholds (quiet < 0.4 ≤ moderate < 0.72 ≤ busy) apply to that
// scaled value: it must not be divided by the spot's own peak, or every spot reads "busy" at its busiest hour.
import type { CrowdLevel } from '@/types/spot'

export const FIRST_HOUR = 6
export const LAST_HOUR = 22
const PEAK_HOUR = 14
const PEAK_SIGMA = 4.2
const SUNSET_HOUR = 19
const SUNSET_WEIGHT = 0.35
const BASE_SHARE = 0.22
const JITTER_MAX = 0.09

export type CrowdLabel = 'quiet' | 'moderate' | 'busy'
// level: estimate on the shared 0..1 scale (capped at 1), used for the label and the bar height.
// value: the same estimate before the cap, so the busiest hour stays the true peak when several hours reach 1.
export type HourlyCrowd = { hour: number; level: number; value: number }

// Stable small integer from the spot id so every visitor sees the same "estimate".
export function seedFromId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973
  return h
}

export function crowdProfile(crowdLevel: CrowdLevel, sunsetPeak: boolean, seed: number): HourlyCrowd[] {
  const raw: { hour: number; value: number }[] = []
  for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour++) {
    const jitter = (((seed * 7 + hour * 13) % 10) / 9) * JITTER_MAX
    let value =
      (crowdLevel / 3) *
        (BASE_SHARE + (1 - BASE_SHARE) * Math.exp(-((hour - PEAK_HOUR) ** 2) / (2 * PEAK_SIGMA ** 2))) +
      jitter
    if (sunsetPeak) value += SUNSET_WEIGHT * Math.exp(-((hour - SUNSET_HOUR) ** 2) / 4)
    raw.push({ hour, value })
  }
  return raw.map((r) => ({ hour: r.hour, level: Math.min(1, r.value), value: r.value }))
}

export function clampToProfileHour(hour: number): number {
  return Math.max(FIRST_HOUR, Math.min(LAST_HOUR, hour))
}

export function crowdLabelAt(profile: HourlyCrowd[], hour: number): CrowdLabel {
  const level = profile.find((p) => p.hour === clampToProfileHour(hour))?.level ?? 0
  if (level < 0.4) return 'quiet'
  if (level < 0.72) return 'moderate'
  return 'busy'
}

export function busiestHour(profile: HourlyCrowd[]): number {
  return profile.reduce((best, p) => (p.value > best.value ? p : best), { hour: PEAK_HOUR, level: -1, value: -1 }).hour
}

export const CROWD_LEVEL_LABEL: Record<CrowdLevel, CrowdLabel> = { 1: 'quiet', 2: 'moderate', 3: 'busy' }
