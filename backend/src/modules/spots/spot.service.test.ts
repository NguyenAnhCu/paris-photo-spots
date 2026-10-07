import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../../lib/errors.js'
import type { AuthUser } from '../auth/auth.service.js'
import { meService } from '../me/me.service.js'
import { spotRepository, type SpotRow } from './spot.repository.js'
import { displayName, resizeCommonsThumb, spotService } from './spot.service.js'

vi.mock('./spot.repository.js', () => ({
  spotRepository: { listAll: vi.fn(), byId: vi.fn(), insertUserSpotUnlessDuplicate: vi.fn() },
}))
vi.mock('../me/me.service.js', () => ({ meService: { assertCanPost: vi.fn() } }))
const repo = vi.mocked(spotRepository)
const ACTOR: AuthUser = { id: 'user-1', role: 'participant', isAnonymous: true, name: 'Lữ khách 1234' }

const COVER = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel.jpg/1280px-Tour_Eiffel.jpg'
const row = (over: Partial<SpotRow> = {}): SpotRow => ({
  id: '2f1c4d6e-8a9b-4c3d-9e1f-0a2b3c4d5e6f',
  name: 'Tour Eiffel',
  name_i18n: { vi: 'Tháp Eiffel', en: 'Eiffel Tower' },
  photo_category: 'skyline',
  crowd_level: 3,
  best_time: 'sunset',
  tip: 'Từ Trocadéro lúc hoàng hôn',
  lng: 2.2945,
  lat: 48.8584,
  cover_photo_url: COVER,
  cover_photo_page_url: 'https://commons.wikimedia.org/wiki/File:Tour_Eiffel.jpg',
  cover_photo_attribution: 'Author · CC BY-SA 4.0 · Wikimedia Commons',
  photo_count: 2,
  source: 'osm',
  ...over,
})

beforeEach(() => vi.resetAllMocks())

describe('resizeCommonsThumb', () => {
  it('swaps the width segment of a Commons thumbnail URL', () => {
    expect(resizeCommonsThumb(COVER, 500)).toBe(COVER.replace('/1280px-', '/500px-'))
  })

  it('leaves other URLs alone and passes null through', () => {
    expect(resizeCommonsThumb('https://example.org/photo.jpg', 500)).toBe('https://example.org/photo.jpg')
    expect(resizeCommonsThumb(null, 500)).toBeNull()
  })
})

describe('spotService.list', () => {
  it('returns a GeoJSON collection with [lng, lat], list-size thumbnails and localized names', async () => {
    repo.listAll.mockResolvedValue([row()])
    const collection = await spotService.list('en')
    expect(collection.type).toBe('FeatureCollection')
    const feature = collection.features[0]
    expect(feature?.geometry.coordinates).toEqual([2.2945, 48.8584])
    expect(feature?.properties).toMatchObject({ name: 'Eiffel Tower', photo_category: 'skyline', photo_count: 2 })
    expect(feature?.properties.cover_thumb_url).toContain('/500px-')
  })

  it('falls back to the original name when there is no label in that language', async () => {
    repo.listAll.mockResolvedValue([row({ name_i18n: { vi: 'Tháp Eiffel' } })])
    expect((await spotService.list('fr')).features[0]?.properties.name).toBe('Tour Eiffel')
  })
  // Regression: Wikidata labels are written for running text ("place du Tertre", "đại lộ Champs-Élysées"), and 292
  // of them started in lower case — the app shows names as titles.
  it('capitalizes the first letter of the shown name, whatever the language', async () => {
    repo.listAll.mockResolvedValue([
      row({ name_i18n: { fr: 'place du Tertre', en: 'pont Notre-Dame', vi: 'đại lộ Champs-Élysées' } }),
    ])
    const names = await Promise.all(
      (['fr', 'en', 'vi'] as const).map(async (lang) => (await spotService.list(lang)).features[0]?.properties.name),
    )
    expect(names).toEqual(['Place du Tertre', 'Pont Notre-Dame', 'Đại lộ Champs-Élysées'])
  })

  it('leaves names that already start with a capital, a digit or a symbol unchanged', async () => {
    repo.listAll.mockResolvedValue([row({ name_i18n: { en: '104 Rue d’Aubervilliers' } })])
    expect((await spotService.list('en')).features[0]?.properties.name).toBe('104 Rue d’Aubervilliers')
  })
})

describe('displayName', () => {
  it('upper-cases only the first character (other letters keep their case)', () => {
    expect(displayName('arc de triomphe du Carrousel')).toBe('Arc de triomphe du Carrousel')
    expect(displayName('éGLISE')).toBe('ÉGLISE')
    expect(displayName('')).toBe('')
  })
})

describe('spotService.byId', () => {
  it('returns the detail with the full-size cover and attribution', async () => {
    repo.byId.mockResolvedValue(row())
    const detail = await spotService.byId(row().id, 'vi')
    expect(detail).toMatchObject({
      name: 'Tháp Eiffel',
      name_original: 'Tour Eiffel',
      cover: { url: COVER, attribution: 'Author · CC BY-SA 4.0 · Wikimedia Commons' },
      user_created: false,
    })
  })

  it('has no cover object when the spot has no photo, and flags user-created spots', async () => {
    repo.byId.mockResolvedValue(row({ cover_photo_url: null, source: 'user' }))
    expect(await spotService.byId(row().id, 'vi')).toMatchObject({ cover: null, user_created: true })
  })

  it('throws 404 SPOT_NOT_FOUND for an unknown id', async () => {
    repo.byId.mockResolvedValue(null)
    await expect(spotService.byId(row().id, 'vi')).rejects.toMatchObject({ code: 'SPOT_NOT_FOUND', status: 404 })
  })
})

describe('spotService.ensureExists', () => {
  it('resolves for a live spot and throws 404 otherwise', async () => {
    repo.byId.mockResolvedValueOnce(row())
    await expect(spotService.ensureExists(row().id)).resolves.toBeUndefined()
    repo.byId.mockResolvedValueOnce(null)
    await expect(spotService.ensureExists(row().id)).rejects.toMatchObject({ code: 'SPOT_NOT_FOUND' })
  })
})

describe('spotService.create', () => {
  const body = {
    name: 'Rue Crémieux',
    photo_category: 'street' as const,
    lat: 48.8473,
    lng: 2.3708,
    lang: 'vi' as const,
  }

  it('creates the spot with the typed name as the name in the UI language, then returns its detail', async () => {
    repo.insertUserSpotUnlessDuplicate.mockResolvedValue({ id: 'new-id' })
    repo.byId.mockResolvedValue(row({ id: 'new-id', name: 'Rue Crémieux', source: 'user' }))
    const created = await spotService.create(ACTOR, body)
    expect(repo.insertUserSpotUnlessDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: 'user-1',
        name: 'Rue Crémieux',
        photoCategory: 'street',
        lng: 2.3708,
        lat: 48.8473,
        tip: null,
        nameI18n: { vi: 'Rue Crémieux' },
        duplicateRadiusM: 30,
      }),
    )
    expect(created).toMatchObject({ id: 'new-id', user_created: true })
  })

  it('answers 409 SPOT_DUPLICATE with the existing id when a spot is already within 30 m', async () => {
    repo.insertUserSpotUnlessDuplicate.mockResolvedValue({ duplicate: { id: 'existing', name: 'Rue Crémieux' } })
    await expect(spotService.create(ACTOR, body)).rejects.toMatchObject({
      code: 'SPOT_DUPLICATE',
      status: 409,
      details: [{ id: 'existing' }],
    })
    expect(repo.byId).not.toHaveBeenCalled()
  })

  it('refuses locations outside the supported area without touching the database', async () => {
    await expect(spotService.create(ACTOR, { ...body, lat: 45.764, lng: 4.8357 })).rejects.toMatchObject({
      code: 'OUT_OF_AREA',
      status: 400,
    })
    expect(repo.insertUserSpotUnlessDuplicate).not.toHaveBeenCalled()
  })

  it('checks the author may post (terms, suspension, quota) before writing anything', async () => {
    vi.mocked(meService.assertCanPost).mockRejectedValue(new AppError('QUOTA_EXCEEDED', 429, 'limit'))
    await expect(spotService.create(ACTOR, body)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
    expect(meService.assertCanPost).toHaveBeenCalledWith(ACTOR, 'spot')
    expect(repo.insertUserSpotUnlessDuplicate).not.toHaveBeenCalled()
  })
})
