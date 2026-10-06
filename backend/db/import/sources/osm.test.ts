import { describe, expect, it } from 'vitest'
import { dedupeByName, osmCategory, tagsToRecord, toPoi, validateOverpass } from './osm.js'
import type { ImportedPoi } from './poiUpsert.js'

describe('osmCategory', () => {
  it.each([
    [{ tourism: 'museum' }, 'museum'],
    [{ tourism: 'gallery' }, 'museum'],
    [{ tourism: 'viewpoint' }, 'viewpoint'],
    [{ tourism: 'zoo' }, 'experience'],
    [{ historic: 'church' }, 'church_religious'],
    [{ leisure: 'garden' }, 'park_garden'],
    [{ amenity: 'marketplace' }, 'market_food'],
    [{ man_made: 'bridge' }, 'bridge'],
    [{ bridge: 'yes', highway: 'footway' }, 'bridge'],
    [{ man_made: 'tower' }, 'tower'],
    [{ highway: 'pedestrian' }, 'street'],
    [{ historic: 'monument' }, 'monument'],
  ])('%j → %s', (tags, expected) => {
    expect(osmCategory(tags)).toBe(expected)
  })

  it('lets the most specific meaning win when tags overlap', () => {
    // Sacré-Cœur: tourism=attraction + amenity=place_of_worship
    expect(osmCategory({ tourism: 'attraction', amenity: 'place_of_worship' })).toBe('church_religious')
    // A museum that is also a castle stays a museum
    expect(osmCategory({ tourism: 'museum', historic: 'castle' })).toBe('museum')
  })

  it('does not treat bridge=no as a bridge', () => {
    expect(osmCategory({ bridge: 'no', highway: 'residential' })).toBe('street')
  })
})

describe('tagsToRecord', () => {
  it('splits key:value strings, keeps the first value and the colon inside values', () => {
    expect(tagsToRecord(['tourism:museum', 'tourism:gallery', 'website:https://x.fr', 'broken', ':nokey'])).toEqual({
      tourism: 'museum',
      website: 'https://x.fr',
    })
  })
})

describe('toPoi', () => {
  it('uses the way centre and keeps only the tags the app knows', () => {
    const poi = toPoi({
      type: 'way',
      id: 42,
      center: { lat: 48.86, lon: 2.31 },
      tags: {
        name: 'Pont Alexandre III',
        man_made: 'bridge',
        wikidata: 'Q1048',
        surface: 'asphalt',
        'contact:website': 'https://x.fr',
      },
    })
    expect(poi).toMatchObject({
      sourceRef: 'way/42',
      category: 'bridge',
      lng: 2.31,
      lat: 48.86,
      tags: ['man_made:bridge'],
      wikidata: 'Q1048',
      website: 'https://x.fr',
    })
  })

  it('skips elements without a name or a position', () => {
    expect(toPoi({ type: 'node', id: 1, lat: 48.8, lon: 2.3, tags: { tourism: 'museum' } })).toBeNull()
    expect(toPoi({ type: 'way', id: 2, tags: { name: 'Nowhere' } })).toBeNull()
  })
})

const poi = (over: Partial<ImportedPoi>): ImportedPoi => ({
  source: 'osm',
  sourceRef: 'node/1',
  name: 'Château de Versailles',
  category: 'monument',
  lng: 2.1204,
  lat: 48.8049,
  tags: [],
  wikidata: null,
  website: null,
  openingHours: null,
  description: null,
  ...over,
})

describe('dedupeByName', () => {
  it('merges the same place mapped several times nearby, keeping the best representation', () => {
    const merged = dedupeByName([
      poi({ sourceRef: 'node/1', tags: ['historic:castle'] }),
      poi({ sourceRef: 'way/2', tags: ['tourism:attraction'], wikidata: 'Q2946', lng: 2.1214 }),
      poi({ sourceRef: 'relation/3', tags: ['tourism:museum'], website: 'https://chateauversailles.fr', lng: 2.1224 }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ wikidata: 'Q2946', website: 'https://chateauversailles.fr' })
    expect(merged[0]?.tags.sort()).toEqual(['historic:castle', 'tourism:attraction', 'tourism:museum'])
  })

  it('keeps same-name places that are far apart (5 "Crue 1910" markers across Paris)', () => {
    const merged = dedupeByName([
      poi({ name: 'Crue 1910', sourceRef: 'node/1', lng: 2.3, lat: 48.85 }),
      poi({ name: 'Crue 1910', sourceRef: 'node/2', lng: 2.37, lat: 48.85 }),
    ])
    expect(merged).toHaveLength(2)
  })

  it('groups street and bridge segments by Wikidata item, whatever the distance', () => {
    const merged = dedupeByName([
      poi({
        name: 'Avenue des Champs-Élysées',
        sourceRef: 'way/1',
        tags: ['highway:primary'],
        wikidata: 'Q194',
        lng: 2.295,
        lat: 48.874,
      }),
      poi({
        name: 'Avenue des Champs-Élysées',
        sourceRef: 'way/2',
        tags: ['highway:primary'],
        wikidata: 'Q194',
        lng: 2.315,
        lat: 48.867,
      }),
      poi({
        name: 'Av. des Champs-Élysées',
        sourceRef: 'way/3',
        tags: ['highway:primary'],
        wikidata: 'Q194',
        lng: 2.32,
        lat: 48.866,
      }),
    ])
    expect(merged).toHaveLength(1)
  })

  // Regression: Pont Notre-Dame came out as "street" when the best-scored segment lacked the bridge tag.
  it('recomputes the category from all merged segment tags', () => {
    const merged = dedupeByName([
      poi({
        name: 'Pont Notre-Dame',
        sourceRef: 'way/1',
        tags: ['highway:secondary'],
        wikidata: 'Q1352',
        category: 'street',
      }),
      poi({
        name: 'Pont Notre-Dame',
        sourceRef: 'way/2',
        tags: ['highway:secondary', 'bridge:yes'],
        wikidata: 'Q1352',
        category: 'bridge',
      }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.category).toBe('bridge')
  })
})

describe('validateOverpass', () => {
  it('accepts a complete response', () => {
    expect(() => validateOverpass({ elements: [{}] })).not.toThrow()
  })

  it('aborts on a partial response (HTTP 200 with a remark) so nothing gets soft-deleted', () => {
    expect(() => validateOverpass({ elements: [{}], remark: 'runtime error: Query timed out' })).toThrow(/incomplete/)
  })

  it('aborts on an empty element list', () => {
    expect(() => validateOverpass({ elements: [] })).toThrow(/no records/)
    expect(() => validateOverpass({})).toThrow(/no records/)
  })
})
