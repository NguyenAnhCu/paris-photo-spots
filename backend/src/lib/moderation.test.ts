import { describe, expect, it } from 'vitest'
import { CONTENT_STATUSES, initialStatus, MODERATION_ACTIONS, needsReason, nextStatus } from './moderation.js'

const env = { TRUST_MIN_APPROVED: 3 }

describe('initialStatus (trust levels, decided 2026-10-07)', () => {
  it('anonymous participants always wait for a reviewer', () => {
    expect(initialStatus({ role: 'participant', isAnonymous: true }, { approved: 99, rejectedRecently: 0 }, env)).toBe(
      'pending',
    )
  })

  it('linked participants wait until they have enough approved posts', () => {
    const linked = { role: 'participant' as const, isAnonymous: false }
    expect(initialStatus(linked, { approved: 2, rejectedRecently: 0 }, env)).toBe('pending')
    expect(initialStatus(linked, { approved: 3, rejectedRecently: 0 }, env)).toBe('approved')
  })

  it('a recent rejection removes the trust', () => {
    expect(initialStatus({ role: 'participant', isAnonymous: false }, { approved: 50, rejectedRecently: 1 }, env)).toBe(
      'pending',
    )
  })

  it('staff posts are public at once', () => {
    for (const role of ['reviewer', 'admin'] as const) {
      expect(initialStatus({ role, isAnonymous: false }, { approved: 0, rejectedRecently: 0 }, env)).toBe('approved')
    }
  })
})

describe('nextStatus', () => {
  // Every (state, action) pair, from the agreed workflow: pending → approved | rejected; approved → hidden;
  // hidden | rejected → approved (restore). Anything else is refused.
  const EXPECTED: Record<string, string | null> = {
    'pending approve': 'approved',
    'pending reject': 'rejected',
    'pending hide': null,
    'pending restore': null,
    'approved approve': null,
    'approved reject': null,
    'approved hide': 'hidden',
    'approved restore': null,
    'rejected approve': null,
    'rejected reject': null,
    'rejected hide': null,
    'rejected restore': 'approved',
    'hidden approve': null,
    'hidden reject': null,
    'hidden hide': null,
    'hidden restore': 'approved',
  }
  it.each(CONTENT_STATUSES.flatMap((s) => MODERATION_ACTIONS.map((a) => [s, a] as const)))(
    '%s + %s',
    (status, action) => {
      expect(nextStatus(status, action)).toBe(EXPECTED[`${status} ${action}`])
    },
  )

  it('rejecting and hiding need a reason; approving and restoring do not', () => {
    expect(MODERATION_ACTIONS.filter(needsReason)).toEqual(['reject', 'hide'])
  })
})
