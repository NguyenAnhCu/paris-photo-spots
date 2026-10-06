import { describe, expect, it } from 'vitest'
import { relativeTime } from './time'

const NOW = new Date('2026-10-06T12:00:00Z')

describe('relativeTime', () => {
  it('uses the largest whole unit', () => {
    expect(relativeTime('2026-10-06T10:00:00Z', 'en', NOW)).toBe('2 hours ago')
    expect(relativeTime('2026-10-05T12:00:00Z', 'en', NOW)).toBe('yesterday')
    expect(relativeTime('2026-09-22T12:00:00Z', 'en', NOW)).toBe('2 weeks ago')
    expect(relativeTime('2025-10-06T12:00:00Z', 'en', NOW)).toBe('last year')
  })

  it('says "now"-ish under a minute', () => {
    expect(relativeTime('2026-10-06T11:59:40Z', 'en', NOW)).toBe('this minute')
  })

  it('is localized', () => {
    expect(relativeTime('2026-10-06T10:00:00Z', 'fr', NOW)).toBe('il y a 2 heures')
    expect(relativeTime('2026-10-06T10:00:00Z', 'vi', NOW)).toBe('2 giờ trước')
  })
})
