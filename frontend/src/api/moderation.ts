import type { ContentStatus, SpotCategory } from '@/types/spot'
import { api } from './client'

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
export type Decision = { action: 'approve' | 'reject' | 'hide' | 'restore'; reasonCode: ReasonCode | null; at: string }

export type QueueAuthor = {
  id: string
  name: string
  isAnonymous: boolean
  approved: number
  rejected: number
  suspendedUntil: string | null
}
export type QueuedPhoto = {
  id: string
  spotId: string
  spotName: string
  url: string
  thumbUrl: string
  focal: string | null
  aperture: string | null
  shutter: string | null
  iso: string | null
  camera: string | null
  gpsDistance: 'lt200m' | 'lt1km' | 'far' | 'none' | null
  duplicateOf: string | null
  createdAt: string
  author: QueueAuthor | null
}
export type QueuedSpot = {
  id: string
  name: string
  photoCategory: SpotCategory
  tip: string | null
  lng: number
  lat: number
  createdAt: string
  nearName: string | null
  nearM: number | null
  author: QueueAuthor | null
}
export type QueuedReport = {
  id: string
  targetType: 'spot' | 'photo'
  targetId: string
  reasonCode: ReasonCode | null
  message: string
  createdAt: string
  targetName: string | null
  targetStatus: ContentStatus | null
  thumbUrl: string | null
  reporterName: string | null
}
type Queue<T> = { items: T[]; total: number; offset: number; limit: number }
export type QueueKind = 'photo' | 'spot' | 'report'

export type MySpot = {
  id: string
  name: string
  photoCategory: SpotCategory
  status: ContentStatus
  lng: number
  lat: number
  createdAt: string
  decision: Decision | null
}
export type MyPhoto = {
  id: string
  spotId: string
  spotName: string
  thumbUrl: string
  status: ContentStatus
  createdAt: string
  decision: Decision | null
}

export const moderationApi = {
  queue<T>(kind: QueueKind, offset = 0, limit = 20) {
    return api.post<Queue<T>>('/moderation/queue/list', { body: { kind, offset, limit } })
  },
  decide(body: {
    targetType: 'spot' | 'photo'
    targetId: string
    action: Decision['action']
    reasonCode?: ReasonCode
    note?: string
  }) {
    return api.post<{ status: ContentStatus }>('/moderation/decide', { body })
  },
  updateSpot(body: { id: string; name?: string; photoCategory?: SpotCategory; tip?: string | null }) {
    return api.post<{ ok: true }>('/moderation/spot/update', { body })
  },
  suspend(body: { userId: string; days: number; reasonCode: ReasonCode }) {
    return api.post<{ postingSuspendedUntil: string }>('/moderation/suspend', { body })
  },
  resolveReport(body: { id: string; outcome: 'dismissed' | 'actioned' }) {
    return api.post<{ ok: true }>('/moderation/report/resolve', { body })
  },
}

export const reportsApi = {
  create(body: { targetType: 'spot' | 'photo'; targetId: string; reasonCode: ReasonCode; message?: string }) {
    return api.post<{ received: true }>('/reports', { body })
  },
}

export const submissionsApi = {
  mine: (signal?: AbortSignal) => api.get<{ spots: MySpot[]; photos: MyPhoto[] }>('/me/submissions', { signal }),
  markSeen: () => api.post<unknown>('/me/notifications/seen', { body: {} }),
}
