// The map itself: pins and clusters really render (guards the blank map of the MapLibre 6 / Vite upgrades), clusters
// expand, pins open spots, and list ↔ map stay in sync.
import { VISIBLE_SPOTS } from '../fixtures/spots.js'
import { spotId } from '../support/db.js'
import { camera, inView, LAYERS, PIN_HIT_OFFSET_Y, rendered, waitForPins } from '../support/map.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitForPins(page)
})

test('map - every spot in view is drawn as a pin or inside a numbered cluster', async ({ page }) => {
  const shown = await inView(
    page,
    VISIBLE_SPOTS.map((s) => s.at),
  )
  const expected = VISIBLE_SPOTS.filter((_, i) => shown[i]).length
  const pins = await rendered(page, LAYERS.pins)
  const clusters = await rendered(page, LAYERS.clusters)
  const inClusters = clusters.reduce((sum, c) => sum + (c.count ?? 0), 0)

  expect(expected, 'Versailles is outside the default view, central Paris inside').toBe(VISIBLE_SPOTS.length - 1)
  expect(clusters.length, 'spots around the Louvre cluster at the default zoom').toBeGreaterThan(0)
  expect(new Set(pins.map((p) => p.id)).size + inClusters).toBe(expected)
  // Every cluster shows its count: needs the glyphs, and must not lose the label collision to a nearby pin.
  expect((await rendered(page, LAYERS.clusterCount)).length).toBe(clusters.length)
})

test('map - clicking a cluster zooms in until its spots show as pins', async ({ page }) => {
  const [cluster] = await rendered(page, LAYERS.clusters)
  if (!cluster) throw new Error('no cluster at the default zoom')
  const before = await camera(page)

  await page.mouse.click(cluster.x, cluster.y)

  await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(before.zoom)
  const louvre = await spotId('louvre')
  await expect.poll(async () => (await rendered(page, LAYERS.pins)).some((p) => p.id === louvre)).toBe(true)
})

test('map - clicking a pin opens the spot, flies to it and highlights its pin', async ({ page }) => {
  const eiffel = await spotId('eiffel')
  const pin = (await rendered(page, LAYERS.pins)).find((p) => p.id === eiffel)
  if (!pin) throw new Error('Eiffel Tower pin not drawn')

  await page.mouse.click(pin.x, pin.y + PIN_HIT_OFFSET_Y)

  await expect(page).toHaveURL(`/spots/${eiffel}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Tháp Eiffel' })).toBeVisible()
  await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThanOrEqual(15)
  const view = await camera(page)
  expect(view.lng).toBeCloseTo(2.2945, 3)
  expect(view.lat).toBeCloseTo(48.8584, 3)
  await expect.poll(async () => (await rendered(page, LAYERS.pinsActive)).map((p) => p.id)).toEqual([eiffel])
})

test('map - hovering a list card highlights its pin; opening it flies the map there', async ({ page }) => {
  const sacreCoeur = await spotId('sacreCoeur')
  const card = page.getByRole('button', { name: /^Vương cung thánh đường Sacré-Cœur/ })

  await card.hover()
  await expect.poll(async () => (await rendered(page, LAYERS.pinsActive)).map((p) => p.id)).toEqual([sacreCoeur])

  await card.click()
  await expect(page).toHaveURL(`/spots/${sacreCoeur}`)
  await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThanOrEqual(15)
  const view = await camera(page)
  expect(view.lng).toBeCloseTo(2.3431, 3)
  expect(view.lat).toBeCloseTo(48.8867, 3)
})
