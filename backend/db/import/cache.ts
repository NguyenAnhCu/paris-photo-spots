import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ImportContext } from './context.js'

// Overpass answers 406 without a User-Agent; other portals ask for an identifiable client too.
export const USER_AGENT = 'paris-map-view/0.1 (open-data import)'

// Throws when a body is unusable (empty, partial, error payload). Runs before caching AND on cached reads,
// so a bad response is never cached and a previously cached bad file cannot slip through.
export type Validate = (body: string) => void

// Public endpoints (Overpass, WDQS) answer 429/502/503/504 when busy; those usually pass on a later attempt.
const RETRYABLE_STATUS = new Set([429, 502, 503, 504])
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 15_000

async function fetchWithRetry(ctx: ImportContext, name: string, url: string, init: RequestInit): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init)
    if (res.ok) return res.text()
    if (!RETRYABLE_STATUS.has(res.status) || attempt >= MAX_ATTEMPTS) {
      throw new Error(`Download failed for ${name}: HTTP ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS})`)
    }
    const delay = RETRY_BASE_DELAY_MS * attempt
    ctx.log(`  … ${name}: HTTP ${res.status}, retrying in ${delay / 1000}s (attempt ${attempt}/${MAX_ATTEMPTS})`)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

// Raw downloads are cached so re-running the import (e.g. after a mapping fix) does not hammer public APIs.
export async function fetchCached(
  ctx: ImportContext,
  name: string,
  url: string,
  init: RequestInit = {},
  validate?: Validate,
): Promise<string> {
  const file = path.join(ctx.cacheDir, name)
  if (!ctx.refresh) {
    let cached: string | null = null
    try {
      cached = await readFile(file, 'utf8')
    } catch {
      // Not cached yet: download below.
    }
    if (cached !== null) {
      validate?.(cached)
      return cached
    }
  }
  ctx.log(`  ↓ ${name} ← ${url.slice(0, 90)}${url.length > 90 ? '…' : ''}`)
  const body = await fetchWithRetry(ctx, name, url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } })
  validate?.(body)
  await mkdir(ctx.cacheDir, { recursive: true })
  await writeFile(file, body)
  return body
}

export async function fetchJsonCached<T>(
  ctx: ImportContext,
  name: string,
  url: string,
  init?: RequestInit,
  validate?: (data: T) => void,
): Promise<T> {
  const body = await fetchCached(ctx, name, url, init, validate ? (b) => validate(JSON.parse(b) as T) : undefined)
  return JSON.parse(body) as T
}
