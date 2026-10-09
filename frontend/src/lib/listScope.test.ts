import { describe, expect, it } from 'vitest'
import { bboxOfPoints, spotsForList } from './listScope'

const at = (id: string, lng: number, lat: number) => ({ id, geometry: { coordinates: [lng, lat] } })
const SPOTS = [at('louvre', 2.3376, 48.8606), at('eiffel', 2.2945, 48.8584), at('versailles', 2.1204, 48.8049)]
const CENTRAL_PARIS: [number, number, number, number] = [2.28, 48.84, 2.36, 48.88]
const ids = (list: { id: string }[]) => list.map((s) => s.id)

describe('spotsForList', () => {
  it('in-view scope keeps only the spots inside the visible map area', () => {
    expect(ids(spotsForList(SPOTS, { bounds: CENTRAL_PARIS, scope: 'view', searching: false }))).toEqual([
      'louvre',
      'eiffel',
    ])
  })

  it('a search looks through every spot, wherever the map is', () => {
    expect(ids(spotsForList(SPOTS, { bounds: CENTRAL_PARIS, scope: 'view', searching: true }))).toEqual([
      'louvre',
      'eiffel',
      'versailles',
    ])
  })

  it('"all" scope ignores the map; unknown bounds (map not ready) list everything', () => {
    expect(spotsForList(SPOTS, { bounds: CENTRAL_PARIS, scope: 'all', searching: false })).toHaveLength(3)
    expect(spotsForList(SPOTS, { bounds: null, scope: 'view', searching: false })).toHaveLength(3)
  })

  it('keeps the original order (popularity from the API)', () => {
    const reversed = [...SPOTS].reverse()
    expect(ids(spotsForList(reversed, { bounds: CENTRAL_PARIS, scope: 'view', searching: false }))).toEqual([
      'eiffel',
      'louvre',
    ])
  })
})

describe('bboxOfPoints', () => {
  it('is the smallest box around the corners (works for a rotated map too)', () => {
    expect(
      bboxOfPoints([
        [2.3, 48.9],
        [2.4, 48.85],
        [2.25, 48.8],
        [2.35, 48.95],
      ]),
    ).toEqual([2.25, 48.8, 2.4, 48.95])
  })
})
