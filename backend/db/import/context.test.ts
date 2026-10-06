import { describe, expect, it } from 'vitest'
import { contextFromCli, DEFAULT_CACHE_DIR } from './context.js'

describe('contextFromCli', () => {
  it('reads --refresh and --allow-shrink, default cache dir', () => {
    const ctx = contextFromCli(['node', 'run.ts', '--refresh'], {})
    expect(ctx).toMatchObject({ refresh: true, allowShrink: false, cacheDir: DEFAULT_CACHE_DIR })
    expect(contextFromCli(['--allow-shrink'], {}).allowShrink).toBe(true)
  })

  it('lets IMPORT_CACHE_DIR point the cache elsewhere (tests, CI)', () => {
    expect(contextFromCli([], { IMPORT_CACHE_DIR: '/tmp/fixtures' }).cacheDir).toBe('/tmp/fixtures')
  })
})
