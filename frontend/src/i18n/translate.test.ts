import { describe, expect, it } from 'vitest'
import { en } from './messages/en'
import { fr } from './messages/fr'
import { vi, type MessageKey } from './messages/vi'
import { createTranslator, hasMessage, isLocale } from './translate'

// Same text as Vietnamese on purpose: a place name, loanwords the design keeps in Vietnamese copy ("Rooftop",
// "Category" in the add form), the ISO acronym, and a pure number format.
const SAME_IN_ALL_LANGUAGES = new Set<string>([
  'app.name',
  'category.rooftop',
  'add.category',
  'exif.iso',
  'weather.value',
  'staff.email', // "Email" is the usual Vietnamese word too
])

describe('message catalogs', () => {
  it.each([
    ['en', en],
    ['fr', fr],
  ])('%s has exactly the Vietnamese keys, none empty', (_name, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(vi).sort())
    for (const [key, text] of Object.entries(catalog)) expect(text.trim(), key).not.toBe('')
  })

  it.each([
    ['en', en],
    ['fr', fr],
  ])('%s is translated (no Vietnamese text left behind)', (_name, catalog) => {
    const untranslated = Object.entries(catalog)
      .filter(([key, text]) => text === vi[key as MessageKey] && !SAME_IN_ALL_LANGUAGES.has(key))
      .map(([key]) => key)
    expect(untranslated).toEqual([])
  })

  it('uses the same {placeholders} in every language', () => {
    const params = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const key of Object.keys(vi) as MessageKey[]) {
      expect(params(en[key]), `en ${key}`).toEqual(params(vi[key]))
      expect(params(fr[key]), `fr ${key}`).toEqual(params(vi[key]))
    }
  })
})

describe('createTranslator', () => {
  it('returns the text of the chosen locale', () => {
    expect(createTranslator('en')('nav.map')).toBe(en['nav.map'])
    expect(createTranslator('fr')('nav.map')).toBe(fr['nav.map'])
  })

  it('fills {params} and leaves unknown ones visible', () => {
    const t = createTranslator('en')
    expect(t('list.count', { count: 3 })).toContain('3')
    expect(t('list.count')).toContain('{count}')
  })

  it('falls back to the key itself for an unknown key instead of crashing', () => {
    expect(createTranslator('fr')('does.not.exist' as MessageKey)).toBe('does.not.exist')
  })
})

describe('isLocale / hasMessage', () => {
  it('accepts only supported locales', () => {
    expect(['vi', 'en', 'fr'].every(isLocale)).toBe(true)
    expect(isLocale('de')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })

  it('knows which keys exist', () => {
    expect(hasMessage('nav.map')).toBe(true)
    expect(hasMessage('errors.NOPE')).toBe(false)
  })
})
