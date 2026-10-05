// Checks the hand-written data file itself: a typo there would otherwise only show up as a failed import.
import { describe, expect, it } from 'vitest'
import { isInBBox, SUPPORTED_SPOT_BBOX } from '../../../src/lib/geo.js'
import { BEST_TIMES, curatedTag, loadCuratedSpots, PHOTO_CATEGORIES } from './curated.js'

describe('curated/photo-spots.json', () => {
  it('loads, with unique ids and valid categories, best times and crowd levels', async () => {
    const spots = await loadCuratedSpots()
    expect(spots.length).toBeGreaterThanOrEqual(15)
    expect(new Set(spots.map((s) => s.id)).size).toBe(spots.length)
    for (const s of spots) {
      expect(PHOTO_CATEGORIES).toContain(s.category)
      expect(BEST_TIMES).toContain(s.bestTime)
      expect([1, 2, 3]).toContain(s.crowdLevel)
      expect(s.tip.trim()).not.toBe('')
    }
  })

  it('places every spot inside the supported area, as [lng, lat] (not swapped)', async () => {
    for (const s of await loadCuratedSpots()) {
      expect(isInBBox([s.lng, s.lat], SUPPORTED_SPOT_BBOX), `${s.id} at ${s.lng},${s.lat}`).toBe(true)
    }
  })

  it('covers the categories OSM barely has (rooftop, wedding)', async () => {
    const categories = new Set((await loadCuratedSpots()).map((s) => s.category))
    expect(categories.has('rooftop')).toBe(true)
    expect(categories.has('wedding')).toBe(true)
  })

  it('tags matched POIs as curated:<id>', async () => {
    const [first] = await loadCuratedSpots()
    expect(first && curatedTag(first)).toBe(`curated:${first?.id}`)
  })
})
