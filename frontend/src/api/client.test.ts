import { describe, expect, it, vi } from 'vitest'
import { json } from '@/test/render'
import { api, ApiError, keysToCamel, keysToSnake, mediaUrl } from './client'

describe('key case conversion', () => {
  it('converts nested objects and arrays both ways', () => {
    const wire = { photo_count: 2, cover: { page_url: 'u' }, items: [{ author_name: 'A' }] }
    const app = { photoCount: 2, cover: { pageUrl: 'u' }, items: [{ authorName: 'A' }] }
    expect(keysToCamel(wire)).toEqual(app)
    expect(keysToSnake(app)).toEqual(wire)
  })

  it('leaves values alone (GeoJSON coordinates, nulls, strings with underscores)', () => {
    expect(keysToCamel({ coordinates: [2.3, 48.8], best_time: 'late_afternoon', tip: null })).toEqual({
      coordinates: [2.3, 48.8],
      bestTime: 'late_afternoon',
      tip: null,
    })
  })
})

describe('api requests', () => {
  it('GET: snake_case query under /api/v1, camelCase result', async () => {
    const fetchMock = vi.fn(async () => json(200, { photo_count: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      api.get('/spots/item', { query: { id: 'a', spotLang: 'vi', empty: '', missing: undefined } }),
    ).resolves.toEqual({
      photoCount: 1,
    })
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]))
    expect(url.pathname).toBe('/api/v1/spots/item')
    expect(Object.fromEntries(url.searchParams)).toEqual({ id: 'a', spot_lang: 'vi' })
  })

  it('POST: JSON body converted to snake_case', async () => {
    const fetchMock = vi.fn(async () => json(201, {}))
    vi.stubGlobal('fetch', fetchMock)
    await api.post('/spots', { body: { photoCategory: 'bridge', lng: 2.3 } })
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init.body))).toEqual({ photo_category: 'bridge', lng: 2.3 })
  })

  it('multipart: sends the FormData untouched and lets the browser set Content-Type', async () => {
    const fetchMock = vi.fn(async () => json(201, {}))
    vi.stubGlobal('fetch', fetchMock)
    const form = new FormData()
    form.set('spot_id', 'x')
    await api.postForm('/photos', form)
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit
    expect(init.body).toBe(form)
    expect(init.headers).toBeUndefined()
  })

  it('turns error responses into ApiError with code and details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(409, { error: { code: 'SPOT_DUPLICATE', message: 'exists', details: [{ id: 'abc' }] } })),
    )
    const err = await api.post('/spots', { body: {} }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, code: 'SPOT_DUPLICATE', details: [{ id: 'abc' }] })
  })

  it('copes with non-JSON error pages (proxy 502) and 204 responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })),
    )
    await expect(api.get('/spots')).rejects.toMatchObject({ status: 502, code: undefined, message: 'HTTP 502' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    )
    await expect(api.get('/spots')).resolves.toBeNull()
  })
})

describe('mediaUrl', () => {
  it('keeps absolute URLs (Commons) and prefixes uploaded-photo paths with the API base', () => {
    expect(mediaUrl('https://upload.wikimedia.org/a.jpg')).toBe('https://upload.wikimedia.org/a.jpg')
    expect(mediaUrl('/media/photos/a.jpg')).toBe('/media/photos/a.jpg')
  })
})
