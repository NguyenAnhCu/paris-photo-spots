import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Everything a run depends on besides the DB client. Passed explicitly (never read from process.argv inside
// modules) so tests can point the cache at fixtures and toggle flags per test.
export type ImportContext = {
  /** Re-download sources instead of reading the cache. */
  refresh: boolean
  /** Accept a source that shrank below MIN_KEEP_RATIO since the last successful run. */
  allowShrink: boolean
  /** Directory holding raw downloads (one file per source). */
  cacheDir: string
  log: (message: string) => void
}

export const DEFAULT_CACHE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache')

export function contextFromCli(argv: string[], env: NodeJS.ProcessEnv): ImportContext {
  return {
    refresh: argv.includes('--refresh'),
    allowShrink: argv.includes('--allow-shrink'),
    cacheDir: env.IMPORT_CACHE_DIR || DEFAULT_CACHE_DIR,
    log: (message) => console.log(message),
  }
}
