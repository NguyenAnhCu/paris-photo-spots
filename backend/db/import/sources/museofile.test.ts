import { describe, expect, it } from 'vitest'
import { parsePipeCsv, toWebsite, unquote, validateMuseofile } from './museofile.js'

// Shape of the real export (checked 2026-10-02): BOM, quoted values, "" escapes, "lat, lng" coordinates, CRLF.
const CSV =
  '﻿"Identifiant"|"Nom_officiel"|"Region"|"Coordonnees"|"URL"\r\n' +
  '"M1128"|"musée d\'Orsay"|"Île-de-France"|"48.8599, 2.3266"|"www.musee-orsay.fr"\r\n' +
  '"M0001"|"Musée ""Le Petit"""|"Île-de-France"|"48.8, 2.3"|""\r\n' +
  '\r\n'

describe('unquote', () => {
  it('removes the surrounding quotes and unescapes ""', () => {
    expect(unquote('"musée d\'Orsay"')).toBe("musée d'Orsay")
    expect(unquote('"Musée ""Le Petit"""')).toBe('Musée "Le Petit"')
    expect(unquote('  plain ')).toBe('plain')
    expect(unquote('"')).toBe('"')
  })
})

describe('parsePipeCsv', () => {
  it('reads the BOM-prefixed, quoted, CRLF export into objects and skips blank lines', () => {
    const rows = parsePipeCsv(CSV)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      Identifiant: 'M1128',
      Nom_officiel: "musée d'Orsay",
      Region: 'Île-de-France',
      Coordonnees: '48.8599, 2.3266',
      URL: 'www.musee-orsay.fr',
    })
    expect(rows[1]?.Nom_officiel).toBe('Musée "Le Petit"')
  })
})

describe('toWebsite', () => {
  it('adds https:// when the scheme is missing and keeps empty values empty', () => {
    expect(toWebsite('www.musee-orsay.fr')).toBe('https://www.musee-orsay.fr')
    expect(toWebsite('http://example.org')).toBe('http://example.org')
    expect(toWebsite('')).toBeNull()
  })
})

describe('validateMuseofile', () => {
  it('accepts the expected header (with BOM)', () => {
    expect(() => validateMuseofile(CSV)).not.toThrow()
  })

  it('stops the run on an HTML error page or a renamed column', () => {
    expect(() => validateMuseofile('<html><body>503 Service Unavailable</body></html>')).toThrow(
      /missing column Identifiant/,
    )
    expect(() => validateMuseofile('"Identifiant"|"Nom"|"Region"|"Coordonnees"')).toThrow(/Nom_officiel/)
  })
})
