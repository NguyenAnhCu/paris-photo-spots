import { describe, expect, it } from 'vitest'
import { matchesQuery, normalizeText } from './search'

describe('normalizeText', () => {
  it('drops accents, maps đ → d and lowercases', () => {
    expect(normalizeText('Cầu Alexandre III')).toBe('cau alexandre iii')
    expect(normalizeText('Église Saint-Sulpice')).toBe('eglise saint-sulpice')
    expect(normalizeText('Đường phố')).toBe('duong pho')
    expect(normalizeText('  Montmartre  ')).toBe('montmartre')
  })
})

describe('matchesQuery', () => {
  const fields = ['Pont Alexandre III', 'Cầu & sông Seine']

  it('matches without accents in either direction ("cau" ↔ "Cầu", "eglise" ↔ "Église")', () => {
    expect(matchesQuery('cau', fields)).toBe(true)
    expect(matchesQuery('CẦU', fields)).toBe(true)
    expect(matchesQuery('eglise', ['Église de la Madeleine'])).toBe(true)
  })

  it('needs every word, in any order and in any field', () => {
    expect(matchesQuery('seine alexandre', fields)).toBe(true)
    expect(matchesQuery('seine louvre', fields)).toBe(false)
  })

  it('matches everything for an empty or blank query', () => {
    expect(matchesQuery('', fields)).toBe(true)
    expect(matchesQuery('   ', fields)).toBe(true)
  })

  it('ignores missing fields', () => {
    expect(matchesQuery('pont', [null, 'Pont Neuf', undefined])).toBe(true)
    expect(matchesQuery('pont', [null, undefined])).toBe(false)
  })
})
