import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { crowdProfile, seedFromId } from '@/lib/crowd'
import { parisHour, useCrowdNow } from './useCrowdNow'

afterEach(() => {
  vi.useRealTimers()
})

describe('parisHour', () => {
  it('reads the hour in Paris whatever the visitor time zone, with summer and winter time', () => {
    expect(parisHour(new Date('2026-07-01T10:00:00Z'))).toBe(12) // CEST, UTC+2
    expect(parisHour(new Date('2026-01-15T10:00:00Z'))).toBe(11) // CET, UTC+1
    expect(parisHour(new Date('2026-01-15T23:30:00Z'))).toBe(0) // midnight is 0, not 24
  })
})

describe('useCrowdNow', () => {
  it('gives the estimated label for the current Paris hour and the busiest hour', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z')) // 14h in Paris
    const { result } = renderHook(() => useCrowdNow('spot-1', 3, false))
    expect(result.current.hour).toBe(14)
    expect(result.current.profile).toEqual(crowdProfile(3, false, seedFromId('spot-1')))
    expect(result.current.label).toBe('busy')
    expect(result.current.peak).toBeGreaterThanOrEqual(13)
  })

  it('uses the first profile hour at night (no data before 6h)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-01T01:00:00Z')) // 3h in Paris
    const { result } = renderHook(() => useCrowdNow('spot-1', 1, false))
    expect(result.current.hour).toBe(6)
  })
})
