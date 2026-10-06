import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@/i18n/translate'
import { fakeFetch, json, renderWithApp } from '@/test/render'
import { SpotPanel } from './SpotDetail'

const t = createTranslator('vi')
const SPOT_ID = '2f1c4d6e-8a9b-4c3d-9e1f-0a2b3c4d5e6f'

const detail = (crowdLevel: 1 | 2 | 3) => ({
  id: SPOT_ID,
  name: 'Jardin du Luxembourg',
  name_original: 'Jardin du Luxembourg',
  photo_category: 'park',
  lng: 2.3372,
  lat: 48.8462,
  crowd_level: crowdLevel,
  best_time: 'late_afternoon',
  tip: 'Ghế sắt xanh và hồ nước giữa vườn.',
  cover: null,
  photo_count: 0,
  user_created: false,
})

function renderDetail(crowdLevel: 1 | 2 | 3, layout: 'panel' | 'page') {
  vi.stubGlobal(
    'fetch',
    fakeFetch({
      'GET /api/v1/spots/item': () => json(200, detail(crowdLevel)),
      'POST /api/v1/photos/list': () => json(200, { items: [], total: 0, offset: 0, limit: 24, has_more: false }),
      'GET /v1/forecast': () => json(200, { current: { temperature_2m: 21.4, weather_code: 2 } }),
    }),
  )
  renderWithApp(<SpotPanel spotId={SPOT_ID} layout={layout} view="detail" />, { route: `/spots/${SPOT_ID}` })
}

describe('SpotPanel (detail)', () => {
  // Crowd information is hidden until real crowd data exists (decision 2026-10-06): the estimate was simulated.
  it.each([
    [1, 'panel'],
    [3, 'page'],
  ] as const)('shows best time and weather but no crowd information (level %i, %s)', async (level, layout) => {
    renderDetail(level, layout)
    expect(await screen.findByText(t('bestTime.late_afternoon'))).toBeInTheDocument()
    expect(await screen.findByText(t('weather.value', { temp: 21, label: t('weather.cloudy') }))).toBeInTheDocument()

    const page = document.body
    // Words of the removed crowd tile and chart, checked literally (their message keys no longer exist).
    for (const text of ['Vắng', 'Vừa', 'Đông', 'Đông người', 'ước tính']) {
      expect(within(page).queryAllByText(new RegExp(text, 'i')), text).toEqual([])
    }
    expect(page.querySelector('.crowd-chart')).toBeNull()
    expect(page.querySelectorAll('.detail__stats .stat')).toHaveLength(2)
  })
})
