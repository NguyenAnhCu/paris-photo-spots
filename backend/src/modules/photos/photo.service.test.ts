import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../../lib/errors.js'
import { removePhoto, savePhoto } from '../../storage/photoStorage.js'
import type { AuthUser } from '../auth/auth.service.js'
import { meService } from '../me/me.service.js'
import { spotService } from '../spots/spot.service.js'
import { photoRepository, type PhotoRow } from './photo.repository.js'
import { photoSignals } from '../../lib/imageSignals.js'
import { photoService } from './photo.service.js'

vi.mock('./photo.repository.js', () => ({ photoRepository: { insert: vi.fn(), listBySpot: vi.fn() } }))
vi.mock('../spots/spot.service.js', () => ({ spotService: { visibleRow: vi.fn() } }))
vi.mock('../../lib/imageSignals.js', () => ({ photoSignals: vi.fn() }))
vi.mock('../me/me.service.js', () => ({ meService: { assertCanPost: vi.fn(), initialStatusFor: vi.fn() } }))
vi.mock('../../storage/photoStorage.js', () => ({
  savePhoto: vi.fn(),
  removePhoto: vi.fn(),
  photoUrl: (name: string) => `/media/photos/${name}`,
}))

const SPOT = '2f1c4d6e-8a9b-4c3d-9e1f-0a2b3c4d5e6f'
const ACTOR: AuthUser = { id: 'user-1', role: 'participant', isAnonymous: true, name: 'Minh' }
const stored = { fileName: 'abc.jpg', thumbName: 'abc_thumb.jpg', width: 2048, height: 1365, thumb: Buffer.from('t') }
const photoRow: PhotoRow = {
  id: 'p1',
  poi_id: SPOT,
  file_name: 'abc.jpg',
  thumb_name: 'abc_thumb.jpg',
  width: 2048,
  height: 1365,
  author_name: 'Minh',
  focal: '35mm',
  aperture: null,
  shutter: null,
  iso: null,
  camera: null,
  status: 'pending',
  created_at: '2026-10-05T10:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(savePhoto).mockResolvedValue(stored)
  vi.mocked(spotService.visibleRow).mockResolvedValue({ lng: 2.2945, lat: 48.8584 } as never)
  vi.mocked(meService.initialStatusFor).mockResolvedValue('pending')
  vi.mocked(photoSignals).mockResolvedValue({ gps_distance: 'lt200m', phash: '00ff00ff00ff00ff' })
})

describe('photoService.upload', () => {
  it('stores the file, saves the row and returns public URLs (never file names or poi_id)', async () => {
    vi.mocked(photoRepository.insert).mockResolvedValue(photoRow)
    const result = await photoService.upload(ACTOR, { spot_id: SPOT, focal: '35mm' }, Buffer.from('img'))
    expect(photoRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        poi_id: SPOT,
        file_name: 'abc.jpg',
        user_id: 'user-1',
        focal: '35mm',
        aperture: null,
        // Trust level decides; reviewer hints computed from the original + stored thumbnail at the spot position.
        status: 'pending',
        gps_distance: 'lt200m',
        phash: '00ff00ff00ff00ff',
      }),
    )
    expect(result).toMatchObject({
      id: 'p1',
      spot_id: SPOT,
      url: '/media/photos/abc.jpg',
      thumb_url: '/media/photos/abc_thumb.jpg',
    })
    expect(photoSignals).toHaveBeenCalledWith(Buffer.from('img'), stored.thumb, [2.2945, 48.8584])
    expect(spotService.visibleRow).toHaveBeenCalledWith(SPOT, ACTOR)
    expect(result).not.toHaveProperty('file_name')
    expect(result).not.toHaveProperty('poi_id')
  })

  it('answers 400 UPLOAD_MISSING_FILE when no file was sent', async () => {
    await expect(photoService.upload(ACTOR, { spot_id: SPOT }, undefined)).rejects.toMatchObject({
      code: 'UPLOAD_MISSING_FILE',
      status: 400,
    })
    expect(savePhoto).not.toHaveBeenCalled()
  })

  it('does not write any file for an unknown spot', async () => {
    vi.mocked(spotService.visibleRow).mockRejectedValue(new AppError('SPOT_NOT_FOUND', 404, 'Spot not found'))
    await expect(photoService.upload(ACTOR, { spot_id: SPOT }, Buffer.from('img'))).rejects.toMatchObject({
      code: 'SPOT_NOT_FOUND',
    })
    expect(savePhoto).not.toHaveBeenCalled()
  })

  it('removes the written files when the database insert fails (no orphans)', async () => {
    vi.mocked(photoRepository.insert).mockRejectedValue(new Error('connection lost'))
    await expect(photoService.upload(ACTOR, { spot_id: SPOT }, Buffer.from('img'))).rejects.toThrow('connection lost')
    expect(removePhoto).toHaveBeenCalledWith(stored)
  })

  it('checks the uploader may post before decoding or writing the image', async () => {
    vi.mocked(meService.assertCanPost).mockRejectedValue(new AppError('TERMS_REQUIRED', 403, 'terms'))
    await expect(photoService.upload(ACTOR, { spot_id: SPOT }, Buffer.from('img'))).rejects.toMatchObject({
      code: 'TERMS_REQUIRED',
    })
    expect(meService.assertCanPost).toHaveBeenCalledWith(ACTOR, 'photo')
    expect(savePhoto).not.toHaveBeenCalled()
  })
})

describe('photoService.list', () => {
  it('returns a page with has_more computed from the total', async () => {
    vi.mocked(photoRepository.listBySpot).mockResolvedValue({ items: [photoRow], total: 3 })
    expect(await photoService.list({ spot_id: SPOT, offset: 1, limit: 1 })).toMatchObject({
      total: 3,
      offset: 1,
      limit: 1,
      has_more: true,
    })
    vi.mocked(photoRepository.listBySpot).mockResolvedValue({ items: [photoRow], total: 3 })
    expect((await photoService.list({ spot_id: SPOT, offset: 2, limit: 1 })).has_more).toBe(false)
  })

  it('passes who is reading: the public sees approved photos, an uploader also their own, reviewers all', async () => {
    vi.mocked(photoRepository.listBySpot).mockResolvedValue({ items: [], total: 0 })
    await photoService.list({ spot_id: SPOT, offset: 0, limit: 24 })
    await photoService.list({ spot_id: SPOT, offset: 0, limit: 24 }, ACTOR)
    await photoService.list({ spot_id: SPOT, offset: 0, limit: 24 }, { ...ACTOR, id: 'rev', role: 'reviewer' })
    expect(vi.mocked(photoRepository.listBySpot).mock.calls.map((c) => c[3])).toEqual([
      { userId: null, seesAll: false },
      { userId: 'user-1', seesAll: false },
      { userId: 'rev', seesAll: true },
    ])
  })

  it('checks that the spot exists first', async () => {
    vi.mocked(spotService.visibleRow).mockRejectedValue(new AppError('SPOT_NOT_FOUND', 404, 'Spot not found'))
    await expect(photoService.list({ spot_id: SPOT, offset: 0, limit: 24 })).rejects.toMatchObject({ status: 404 })
    expect(photoRepository.listBySpot).not.toHaveBeenCalled()
  })
})
