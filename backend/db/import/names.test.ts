import { describe, expect, it } from 'vitest'
import { nameTokens, normalizeName, similarNames } from './names.js'

describe('normalizeName', () => {
  it('drops accents, case and punctuation', () => {
    expect(normalizeName("Musée d'Orsay")).toBe('musee d orsay')
    expect(normalizeName('Sacré-Cœur')).toBe('sacre c ur')
    expect(normalizeName('  Pont   Neuf ')).toBe('pont neuf')
  })
})

describe('nameTokens', () => {
  it('ignores generic words that make every place look alike', () => {
    expect([...nameTokens('Musée national du Louvre')]).toEqual(['louvre'])
    expect([...nameTokens('Château de Versailles')]).toEqual(['versailles'])
  })

  it('is empty when only generic words remain', () => {
    expect(nameTokens('Musée de Paris').size).toBe(0)
  })
})

describe('similarNames', () => {
  it('matches the same place written differently (Muséofile vs OSM)', () => {
    expect(similarNames("Musée de l'Armée", 'Musée de l’Armée - Invalides')).toBe(true)
    expect(similarNames("Musée d'Orsay", 'Orsay')).toBe(true)
  })

  it('does not match neighbours that only share generic words', () => {
    expect(similarNames('Musée Rodin', "Musée de l'Armée")).toBe(false)
    expect(similarNames('Musée de Paris', 'Musée de Paris')).toBe(false)
  })
})
