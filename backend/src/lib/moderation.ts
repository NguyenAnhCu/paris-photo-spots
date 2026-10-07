// Moderation rules as plain functions: who goes straight to public, which decisions are allowed from which state.
import type { Role } from './permissions.js'

export const CONTENT_STATUSES = ['pending', 'approved', 'rejected', 'hidden'] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const MODERATION_ACTIONS = ['approve', 'reject', 'hide', 'restore'] as const
export type ModerationAction = (typeof MODERATION_ACTIONS)[number]

// Reasons a reviewer picks from (shown to the author, translated in the app).
export const REASON_CODES = [
  'not_photo_spot',
  'wrong_location',
  'low_quality',
  'copyright',
  'people_identifiable',
  'inappropriate',
  'spam',
  'duplicate',
  'other',
] as const
export type ReasonCode = (typeof REASON_CODES)[number]

type TrustEnv = { TRUST_MIN_APPROVED: number }

// New content goes public at once for staff and trusted participants; everyone else waits for a reviewer.
// Trusted = a linked (non-anonymous) account with enough approved posts and no rejection in the recent window.
export function initialStatus(
  author: { role: Role; isAnonymous: boolean },
  history: { approved: number; rejectedRecently: number },
  env: TrustEnv,
): ContentStatus {
  if (author.role !== 'participant') return 'approved'
  if (author.isAnonymous) return 'pending'
  return history.approved >= env.TRUST_MIN_APPROVED && history.rejectedRecently === 0 ? 'approved' : 'pending'
}

const TRANSITIONS: Record<ModerationAction, { from: ContentStatus[]; to: ContentStatus; needsReason: boolean }> = {
  approve: { from: ['pending'], to: 'approved', needsReason: false },
  reject: { from: ['pending'], to: 'rejected', needsReason: true },
  hide: { from: ['approved'], to: 'hidden', needsReason: true },
  restore: { from: ['hidden', 'rejected'], to: 'approved', needsReason: false },
}

// null = the action makes no sense from this state (e.g. approving something already public).
export function nextStatus(current: ContentStatus, action: ModerationAction): ContentStatus | null {
  const rule = TRANSITIONS[action]
  return rule.from.includes(current) ? rule.to : null
}

export const needsReason = (action: ModerationAction) => TRANSITIONS[action].needsReason
