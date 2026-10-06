import { describe, expect, it } from 'vitest'
import {
  busiestHour,
  clampToProfileHour,
  CROWD_LEVEL_LABEL,
  crowdLabelAt,
  crowdProfile,
  FIRST_HOUR,
  LAST_HOUR,
  seedFromId,
  type HourlyCrowd,
} from './crowd'

const flat = (levels: Record<number, number>): HourlyCrowd[] =>
  Object.entries(levels).map(([hour, level]) => ({ hour: Number(hour), level }))

describe('seedFromId', () => {
  it('is stable for the same id and differs between ids', () => {
    expect(seedFromId('spot-a')).toBe(seedFromId('spot-a'))
    expect(seedFromId('spot-a')).not.toBe(seedFromId('spot-b'))
  })

  it('stays a small non-negative integer even for long ids', () => {
    const seed = seedFromId('0b8e5c7a-3f1d-4c2e-9a6b-1d2e3f4a5b6c'.repeat(10))
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThan(9973)
  })
})

describe('crowdProfile', () => {
  it('covers every hour from FIRST_HOUR to LAST_HOUR, normalized so the busiest hour is 1', () => {
    const profile = crowdProfile(2, false, 42)
    expect(profile.map((p) => p.hour)).toEqual(Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => i + 6))
    expect(Math.max(...profile.map((p) => p.level))).toBe(1)
    expect(profile.every((p) => p.level > 0 && p.level <= 1)).toBe(true)
  })

  it('is deterministic: every visitor sees the same estimate for a spot', () => {
    expect(crowdProfile(3, true, 7)).toEqual(crowdProfile(3, true, 7))
  })

  it('peaks in the early afternoon, and near 19h for sunset spots', () => {
    expect(busiestHour(crowdProfile(3, false, 0))).toBeGreaterThanOrEqual(13)
    expect(busiestHour(crowdProfile(3, false, 0))).toBeLessThanOrEqual(15)
    expect(busiestHour(crowdProfile(1, true, 0))).toBeGreaterThanOrEqual(18)
    expect(busiestHour(crowdProfile(1, true, 0))).toBeLessThanOrEqual(19)
  })

  it('makes quiet spots quiet in the early morning', () => {
    expect(crowdLabelAt(crowdProfile(1, false, 0), 7)).toBe('quiet')
  })
})

describe('crowdLabelAt / clampToProfileHour / busiestHour', () => {
  it('labels by thresholds 0.4 and 0.72', () => {
    const profile = flat({ 8: 0.39, 9: 0.4, 10: 0.71, 11: 0.72 })
    expect([8, 9, 10, 11].map((h) => crowdLabelAt(profile, h))).toEqual(['quiet', 'moderate', 'moderate', 'busy'])
  })

  it('reads hours outside the profile as its first/last hour (night → 6h or 22h)', () => {
    expect(clampToProfileHour(3)).toBe(FIRST_HOUR)
    expect(clampToProfileHour(23)).toBe(LAST_HOUR)
    expect(clampToProfileHour(12)).toBe(12)
    expect(crowdLabelAt(flat({ 6: 0.9, 22: 0.1 }), 2)).toBe('busy')
    expect(crowdLabelAt(flat({ 6: 0.9, 22: 0.1 }), 23)).toBe('quiet')
  })

  it('returns the first hour with the highest level', () => {
    expect(busiestHour(flat({ 10: 0.5, 16: 1, 18: 1 }))).toBe(16)
  })

  it('maps the team-set crowd level to a label', () => {
    expect(CROWD_LEVEL_LABEL).toEqual({ 1: 'quiet', 2: 'moderate', 3: 'busy' })
  })
})
