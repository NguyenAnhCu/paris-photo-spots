import { describe, expect, it } from 'vitest'
import { commonsFileName, parseSparql, parseWktPoint } from './wikidata.js'

describe('parseWktPoint', () => {
  it('reads WKT "Point(lng lat)" in lng-lat order', () => {
    expect(parseWktPoint('Point(2.2945 48.8584)')).toEqual([2.2945, 48.8584])
    expect(parseWktPoint('point( -0.5 -12.25 )')).toEqual([-0.5, -12.25])
  })

  it('returns null for anything else', () => {
    expect(parseWktPoint('LineString(0 0, 1 1)')).toBeNull()
    expect(parseWktPoint('')).toBeNull()
  })
})

describe('commonsFileName', () => {
  it('extracts and decodes the file name of a Special:FilePath URL', () => {
    expect(
      commonsFileName('http://commons.wikimedia.org/wiki/Special:FilePath/Tour%20Eiffel%20%C3%A9t%C3%A9.jpg'),
    ).toBe('Tour Eiffel été.jpg')
    expect(commonsFileName('https://example.org/image.jpg')).toBe('')
  })
})

describe('parseSparql', () => {
  const item = (qid: string) => ({ value: `http://www.wikidata.org/entity/${qid}` })

  it('merges the several rows of one item, keeping the first value of each field', () => {
    const map = parseSparql([
      {
        item: item('Q243'),
        sitelinks: { value: '180' },
        image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/A.jpg' },
        vi: { value: 'Tháp Eiffel' },
      },
      {
        item: item('Q243'),
        sitelinks: { value: '180' },
        image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/B.jpg' },
        coord: { value: 'Point(2.2945 48.8584)' },
        en: { value: 'Eiffel Tower' },
      },
    ])
    expect(map.get('Q243')).toEqual({
      sitelinks: 180,
      imageFile: 'A.jpg',
      coord: [2.2945, 48.8584],
      labels: { vi: 'Tháp Eiffel', en: 'Eiffel Tower' },
    })
  })

  it('handles items without image, coordinates or labels, and skips rows without an item', () => {
    const map = parseSparql([{ item: item('Q1'), sitelinks: { value: '3' } }, { sitelinks: { value: '9' } }])
    expect([...map.keys()]).toEqual(['Q1'])
    expect(map.get('Q1')).toEqual({ sitelinks: 3, imageFile: null, coord: null, labels: {} })
  })
})
