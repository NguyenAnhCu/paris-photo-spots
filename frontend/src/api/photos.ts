import type { CommunityPhoto, ExifSummary, Page } from '@/types/spot'
import { api } from './client'

export type PhotoUpload = { spotId: string; file: File; authorName?: string; exif?: ExifSummary }

export const photosApi = {
  list(spotId: string, offset: number, limit: number, signal?: AbortSignal) {
    return api.post<Page<CommunityPhoto>>('/photos/list', { body: { spotId, offset, limit }, signal })
  },
  upload({ spotId, file, authorName, exif }: PhotoUpload) {
    const form = new FormData()
    form.set('spot_id', spotId)
    if (authorName) form.set('author_name', authorName)
    for (const key of ['focal', 'aperture', 'shutter', 'iso', 'camera'] as const) {
      const value = exif?.[key]
      if (value) form.set(key, value)
    }
    form.set('file', file)
    return api.postForm<CommunityPhoto>('/photos', form)
  },
}
