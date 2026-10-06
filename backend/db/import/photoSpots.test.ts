import { describe, expect, it } from 'vitest'
import { MIN_SITELINKS, shortenArtist, stripHtml, toAttribution } from './photoSpots.js'

describe('stripHtml', () => {
  it('keeps the plain text of the Commons Artist HTML', () => {
    expect(stripHtml('<a href="//commons.wikimedia.org/wiki/User:X">Benh LIEU&nbsp;SONG</a> &amp; co')).toBe(
      'Benh LIEU SONG & co',
    )
    expect(stripHtml('<span>L&#39;auteur &quot;X&quot;</span>\n\n  ')).toBe('L\'auteur "X"')
  })
})

describe('shortenArtist', () => {
  it('keeps short names untouched', () => {
    expect(shortenArtist('William Crochot')).toBe('William Crochot')
  })

  // Regression: one Artist field was a 750-character paragraph of reuse instructions.
  it('cuts long text at a word boundary, drops trailing punctuation and adds …', () => {
    const long =
      'Another one of my pictures: This photograph was taken by Medium69 (William Crochot) and released under the license stated below.'
    const short = shortenArtist(long)
    expect(short.length).toBeLessThanOrEqual(81)
    expect(short.endsWith('…')).toBe(true)
    expect(short).toBe('Another one of my pictures: This photograph was taken by Medium69 (William…')
  })

  it('cuts mid-word when there is no space in the first half', () => {
    expect(shortenArtist('x'.repeat(100), 10)).toBe(`${'x'.repeat(10)}…`)
  })
})

describe('toAttribution', () => {
  it('builds "author · license · Wikimedia Commons"', () => {
    expect(
      toAttribution({
        extmetadata: { Artist: { value: '<a href="#">Jane Doe</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } },
      }),
    ).toBe('Jane Doe · CC BY-SA 4.0 · Wikimedia Commons')
  })

  it('never produces an empty credit', () => {
    expect(toAttribution({})).toBe('Unknown author · see source · Wikimedia Commons')
  })
})

describe('MIN_SITELINKS', () => {
  it('asks streets, bridges and skylines for fewer Wikipedia articles than landmarks', () => {
    expect(MIN_SITELINKS.bridge).toBeLessThan(MIN_SITELINKS.landmark)
    expect(MIN_SITELINKS.street).toBeLessThan(MIN_SITELINKS.landmark)
    expect(MIN_SITELINKS.suburb).toBeGreaterThanOrEqual(MIN_SITELINKS.landmark)
  })
})
