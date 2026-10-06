import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@/i18n/translate'
import { currentLocation, fakeFetch, json, renderWithApp } from '@/test/render'
import { SpotPanel } from './SpotDetail'

const t = createTranslator('vi')
const SPOT_ID = '2f1c4d6e-8a9b-4c3d-9e1f-0a2b3c4d5e6f'
const NAME = 'Pont Neuf'

const detail = (photoCount: number) => ({
  id: SPOT_ID,
  name: NAME,
  name_original: NAME,
  photo_category: 'bridge',
  lng: 2.3412,
  lat: 48.8572,
  crowd_level: 2,
  best_time: null,
  tip: null,
  cover: null,
  photo_count: photoCount,
  user_created: false,
})

const photo = (n: number, extra: Record<string, string | null> = {}) => ({
  id: `p${n}`,
  spot_id: SPOT_ID,
  url: `/media/photos/p${n}.jpg`,
  thumb_url: `/media/photos/p${n}_thumb.jpg`,
  width: 1200,
  height: 800,
  author_name: `Tác giả ${n}`,
  focal: null,
  aperture: null,
  shutter: null,
  iso: null,
  camera: null,
  created_at: '2026-10-01T10:00:00Z',
  ...extra,
})

type ListBody = { offset: number; limit: number }

// pages: what POST /photos/list answers for offset 0, 24, … (the request body is checked, not assumed).
function renderGallery(pages: ReturnType<typeof photo>[][], total = pages.flat().length) {
  const listCalls: ListBody[] = []
  vi.stubGlobal(
    'fetch',
    fakeFetch({
      'GET /api/v1/spots/item': () => json(200, detail(total)),
      'POST /api/v1/photos/list': (_url, init) => {
        const body = JSON.parse(String(init?.body)) as ListBody
        listCalls.push(body)
        const index = body.offset / body.limit
        const items = pages[index] ?? []
        return json(200, { items, total, offset: body.offset, limit: body.limit, has_more: index < pages.length - 1 })
      },
    }),
  )
  const view = renderWithApp(<SpotPanel spotId={SPOT_ID} layout="panel" view="photos" />, {
    route: `/spots/${SPOT_ID}/photos`,
  })
  return { ...view, listCalls }
}

const viewerAlt = (n: number) => t('photos.alt', { name: NAME, author: `Tác giả ${n}` })
const probe = () => screen.getByTestId('location')

describe('CommunityPhotos', () => {
  it('opens a photo from the grid, browses with wrap-around and goes back to the grid', async () => {
    const user = userEvent.setup()
    renderGallery([[photo(1), photo(2), photo(3)]])

    await user.click(await screen.findByRole('button', { name: t('photos.open', { index: 2 }) }))
    expect(screen.getByRole('img', { name: viewerAlt(2) })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: t('photos.next') }))
    expect(screen.getByRole('img', { name: viewerAlt(3) })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t('photos.next') }))
    expect(screen.getByRole('img', { name: viewerAlt(1) })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t('photos.prev') }))
    expect(screen.getByRole('img', { name: viewerAlt(3) })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: t('photos.grid') }))
    expect(screen.getAllByRole('button', { name: /^Xem ảnh \d$/ })).toHaveLength(3)
  })

  it('keyboard: ←/→ browse; Escape closes the viewer only, a second Escape closes the spot', async () => {
    const user = userEvent.setup()
    renderGallery([[photo(1), photo(2)]])
    await user.click(await screen.findByRole('button', { name: t('photos.open', { index: 1 }) }))

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('img', { name: viewerAlt(2) })).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('img', { name: viewerAlt(1) })).toBeInTheDocument()

    // The panel listens for Escape too: the viewer must swallow the first one.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('img', { name: viewerAlt(1) })).toBeNull()
    expect(currentLocation(probe()).path).toBe(`/spots/${SPOT_ID}/photos`)

    await user.keyboard('{Escape}')
    expect(currentLocation(probe()).path).toBe('/')
  })

  it('shows the EXIF of the photo being viewed, and none for a photo without it', async () => {
    const user = userEvent.setup()
    renderGallery([
      [
        photo(1, { focal: '35mm', aperture: 'f/1.8', shutter: '1/250s', iso: '100', camera: 'Sony · ILCE-7M4' }),
        photo(2),
      ],
    ])
    await user.click(await screen.findByRole('button', { name: t('photos.open', { index: 1 }) }))

    for (const text of ['35mm', 'f/1.8', '1/250s', 'ISO 100', 'Sony · ILCE-7M4']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    await user.click(screen.getByRole('button', { name: t('photos.next') }))
    expect(screen.queryByText('35mm')).toBeNull()
    expect(document.querySelector('.exif-pills')).toBeNull()
  })

  it('"Xem thêm" asks for the next page and appends it', async () => {
    const user = userEvent.setup()
    const page1 = Array.from({ length: 24 }, (_, i) => photo(i + 1))
    const { listCalls } = renderGallery([page1, [photo(25), photo(26)]])

    expect(await screen.findAllByRole('button', { name: /^Xem ảnh \d+$/ })).toHaveLength(24)
    await user.click(screen.getByRole('button', { name: t('photos.loadMore') }))

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Xem ảnh \d+$/ })).toHaveLength(26))
    expect(listCalls.map((c) => c.offset)).toEqual([0, 24])
    expect(screen.queryByRole('button', { name: t('photos.loadMore') })).toBeNull()
  })

  it('no photos yet: says so', async () => {
    renderGallery([[]], 0)
    expect(await screen.findByText(t('photos.empty'))).toBeInTheDocument()
  })
})
