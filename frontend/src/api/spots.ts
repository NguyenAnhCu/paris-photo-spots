import type { Locale } from '../i18n/translate'
import type { SpotCategory, SpotCollection, SpotDetail } from '../types/spot'
import { api } from './client'

export type NewSpot = { name: string; photoCategory: SpotCategory; lat: number; lng: number; tip?: string }

export const spotsApi = {
  list(lang: Locale, signal?: AbortSignal) {
    return api.get<SpotCollection>('/spots', { query: { lang }, signal })
  },
  item(id: string, lang: Locale, signal?: AbortSignal) {
    return api.get<SpotDetail>('/spots/item', { query: { id, lang }, signal })
  },
  create(spot: NewSpot, lang: Locale) {
    return api.post<SpotDetail>('/spots', { body: { ...spot, lang } })
  },
}
