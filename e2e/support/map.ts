// Reads the MapLibre map the E2E build exposes as window.__map (SpotMap.tsx), to wait for real rendering and to
// click pins and clusters at their on-screen position.
import type { Page } from '@playwright/test'

export const LAYERS = {
  clusters: 'spot-clusters',
  clusterCount: 'spot-cluster-count',
  pins: 'spot-pins',
  pinsActive: 'spot-pins-active',
} as const

export type Rendered = { id: string | null; count: number | null; x: number; y: number }

type MapLike = {
  loaded(): boolean
  once(event: 'idle', listener: () => void): unknown
  triggerRepaint(): void
  getLayer(id: string): unknown
  getZoom(): number
  getCenter(): { lng: number; lat: number }
  getBounds(): { contains(p: [number, number]): boolean }
  project(p: [number, number]): { x: number; y: number }
  getCanvas(): HTMLCanvasElement
  queryRenderedFeatures(options: { layers: string[] }): {
    properties: Record<string, unknown>
    geometry: { type: string; coordinates: unknown }
  }[]
}
declare global {
  interface Window {
    __map?: MapLike
  }
}

// Resolves once the map has finished drawing the spots. The GeoJSON is parsed in MapLibre's worker, so this also proves
// the worker loaded (the blank map of the MapLibre 6 upgrade failed exactly there).
export async function waitForPins(page: Page): Promise<void> {
  await page.waitForFunction((pins) => !!window.__map?.getLayer(pins), LAYERS.pins, { timeout: 20_000 })
  await waitForIdle(page)
}

// 'idle' = no camera move, every source loaded, symbols placed and faded in. A repaint makes sure one comes even if
// the map is already idle.
export async function waitForIdle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const map = window.__map
        if (!map) throw new Error('map not ready')
        map.once('idle', () => resolve())
        map.triggerRepaint()
      }),
  )
}

// Features of one layer with their position in page coordinates (ready for page.mouse / page.touchscreen).
export async function rendered(page: Page, layer: string): Promise<Rendered[]> {
  return page.evaluate((layer) => {
    const map = window.__map
    if (!map) return []
    const box = map.getCanvas().getBoundingClientRect()
    return map.queryRenderedFeatures({ layers: [layer] }).map((f) => {
      const [lng, lat] = f.geometry.coordinates as [number, number]
      const p = map.project([lng, lat])
      return {
        id: (f.properties.id as string | undefined) ?? null,
        count: (f.properties.point_count as number | undefined) ?? null,
        x: box.left + p.x,
        y: box.top + p.y,
      }
    })
  }, layer)
}

export async function camera(page: Page): Promise<{ zoom: number; lng: number; lat: number }> {
  return page.evaluate(() => {
    const map = window.__map
    if (!map) throw new Error('map not ready')
    const c = map.getCenter()
    return { zoom: map.getZoom(), lng: c.lng, lat: c.lat }
  })
}

// Which of these coordinates the current view shows.
export async function inView(page: Page, points: [number, number][]): Promise<boolean[]> {
  return page.evaluate((points) => {
    const map = window.__map
    if (!map) throw new Error('map not ready')
    const bounds = map.getBounds()
    return points.map((p) => bounds.contains(p))
  }, points)
}

// Pins are anchored at the bottom: aim a little above the coordinate to hit the drop shape.
export const PIN_HIT_OFFSET_Y = -14
