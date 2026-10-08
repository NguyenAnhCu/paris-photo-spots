import type { CommunityPhoto, ExifSummary, Page } from '@/types/spot'
import { api } from './client'

// The author is the signed-in identity (session cookie); no name is sent.
export type PhotoUpload = { spotId: string; file: File; exif?: ExifSummary }

export const photosApi = {
  list(spotId: string, offset: number, limit: number, signal?: AbortSignal) {
    return api.post<Page<CommunityPhoto>>('/photos/list', { body: { spotId, offset, limit }, signal })
  },
  upload({ spotId, file, exif }: PhotoUpload) {
    const form = new FormData()
    form.set('spot_id', spotId)
    for (const key of ['focal', 'aperture', 'shutter', 'iso', 'camera'] as const) {
      const value = exif?.[key]
      if (value) form.set(key, value)
    }
    form.set('file', file)
    return api.postForm<CommunityPhoto>('/photos', form)
  },
}
