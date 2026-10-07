import { describe, expect, it } from 'vitest'
import { anonymousName, normalizeUserName } from './userName.js'

describe('anonymousName', () => {
  it('is a friendly name with a 4-digit number, in the visitor language', () => {
    expect(anonymousName('vi', () => 0)).toBe('Lữ khách 1000')
    expect(anonymousName('en', () => 0.5)).toBe('Traveller 5500')
    expect(anonymousName('fr', () => 0.9999)).toBe('Voyageur 9999')
  })

  it('falls back to Vietnamese for an unknown language', () => {
    expect(anonymousName('de', () => 0)).toBe('Lữ khách 1000')
  })
})

describe('normalizeUserName', () => {
  it('trims and collapses spaces', () => {
    expect(normalizeUserName('  Linh   Nguyễn ')).toEqual({ ok: true, name: 'Linh Nguyễn' })
  })

  it.each([
    ['too short', 'A'],
    ['too long', 'x'.repeat(41)],
    ['markup', '<b>Linh</b>'],
    ['control characters', 'Linh\u0000'],
    ['only spaces', '    '],
  ])('rejects %s', (_label, input) => {
    expect(normalizeUserName(input).ok).toBe(false)
  })

  it('rejects names that pretend to be staff or the app, whatever the case or accents', () => {
    for (const name of ['Admin', 'ADMINISTRATOR', 'Reviewer 2', 'Paris Photo Spots', 'Quản trị viên', 'Kiểm duyệt']) {
      expect(normalizeUserName(name).ok, name).toBe(false)
    }
  })

  it('only whole words count: ordinary names that contain them are fine', () => {
    for (const name of ['Badminton fan', 'Chụp ảnh Paris', 'Linh Reviewers-club']) {
      expect(normalizeUserName(name), name).toEqual({ ok: true, name })
    }
  })
})
