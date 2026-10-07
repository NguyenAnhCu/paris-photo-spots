import type { ReasonCode } from './moderation'
import { api } from './client'

export type Role = 'participant' | 'reviewer' | 'admin'
export type AdminUser = {
  id: string
  name: string
  email: string | null
  role: Role
  isAnonymous: boolean
  postingSuspendedUntil: string | null
  createdAt: string
  spots: number
  photos: number
}
export type LogEntry = {
  id: string
  targetType: 'spot' | 'photo' | 'report' | 'user'
  targetId: string
  action: string
  reasonCode: ReasonCode | null
  note: string | null
  createdAt: string
  actorId: string
  actorName: string | null
  targetName: string | null
}
type Page<T> = { items: T[]; total: number; offset: number; limit: number }

export const adminApi = {
  users: (filter: { search?: string; role?: Role }) => api.post<Page<AdminUser>>('/admin/users/list', { body: filter }),
  setRole: (userId: string, role: Role) =>
    api.post<{ role: Role }>('/admin/users/set-role', { body: { userId, role } }),
  suspend: (userId: string, until: string | null) =>
    api.post<unknown>('/admin/users/suspend', { body: { userId, until } }),
  remove: (userId: string) => api.post<unknown>('/admin/users/delete', { body: { userId } }),
  log: () => api.post<Page<LogEntry>>('/admin/moderation-log/list', { body: {} }),
  config: () => api.get<Record<string, number | string | boolean>>('/admin/config'),
}
