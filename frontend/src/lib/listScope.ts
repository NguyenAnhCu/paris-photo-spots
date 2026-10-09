import { isInBBox, type BBox, type LngLat } from './geo'

// What the spot list shows: the spots inside the visible map area ("view"), or all of them ("all").
// A search always looks through every spot: typing "Versailles" while looking at central Paris must still find it.
export type ListScope = 'view' | 'all'

export function spotsForList<T extends { geometry: { coordinates: number[] } }>(
  features: T[],
  opts: { bounds: BBox | null; scope: ListScope; searching: boolean },
): T[] {
  const { bounds } = opts
  if (opts.searching || opts.scope === 'all' || !bounds) return features
  return features.filter((f) => isInBBox([f.geometry.coordinates[0] ?? NaN, f.geometry.coordinates[1] ?? NaN], bounds))
}

// Smallest box around some points: the four corners of the visible map area (a rotated map gives a tilted area).
export function bboxOfPoints(points: LngLat[]): BBox {
  const lngs = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
}
