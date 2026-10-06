import { describe, expect, it, vi } from 'vitest'
import { rememberLocale, resolveInitialLocale } from './locale'

describe('resolveInitialLocale', () => {
  it('prefers ?lang= from a shared link', () => {
    rememberLocale('fr')
    expect(resolveInitialLocale('?lang=en')).toBe('en')
  })

  it('then the remembered choice, then Vietnamese', () => {
    expect(resolveInitialLocale('')).toBe('vi')
    rememberLocale('fr')
    expect(resolveInitialLocale('?lang=xx')).toBe('fr')
  })

  it('falls back to Vietnamese when storage is blocked (private mode)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(resolveInitialLocale('')).toBe('vi')
  })

  it('does not throw when the choice cannot be saved', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => rememberLocale('en')).not.toThrow()
  })
})
