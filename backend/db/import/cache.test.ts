import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCached, fetchJsonCached, USER_AGENT } from './cache.js'
import type { ImportContext } from './context.js'

let dir: string
const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  refresh: false,
  allowShrink: false,
  cacheDir: dir,
  log: vi.fn(),
  ...over,
})
const fetchMock = vi.fn<typeof fetch>()
const reply = (status: number, body = '') => new Response(body, { status })
const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  )

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'pmv-cache-test-'))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  fetchMock.mockReset()
  await rm(dir, { recursive: true, force: true })
})

describe('fetchCached', () => {
  it('downloads with an identifiable User-Agent and caches the body', async () => {
    fetchMock.mockResolvedValue(reply(200, 'data'))
    expect(await fetchCached(ctx(), 'src.txt', 'https://example.org/src')).toBe('data')
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ 'User-Agent': USER_AGENT })
    expect(await readFile(path.join(dir, 'src.txt'), 'utf8')).toBe('data')
  })

  it('reads the cache instead of downloading again', async () => {
    await writeFile(path.join(dir, 'src.txt'), 'cached')
    expect(await fetchCached(ctx(), 'src.txt', 'https://example.org/src')).toBe('cached')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('downloads again with --refresh', async () => {
    await writeFile(path.join(dir, 'src.txt'), 'old')
    fetchMock.mockResolvedValue(reply(200, 'new'))
    expect(await fetchCached(ctx({ refresh: true }), 'src.txt', 'https://example.org/src')).toBe('new')
  })

  it('never caches a body that fails validation', async () => {
    fetchMock.mockResolvedValue(reply(200, 'partial'))
    const validate = () => {
      throw new Error('incomplete')
    }
    await expect(fetchCached(ctx(), 'src.txt', 'https://example.org/src', {}, validate)).rejects.toThrow('incomplete')
    expect(await exists(path.join(dir, 'src.txt'))).toBe(false)
  })

  it('validates cached files too (an old bad file cannot slip through)', async () => {
    await writeFile(path.join(dir, 'src.txt'), 'bad')
    const validate = vi.fn(() => {
      throw new Error('bad cache')
    })
    await expect(fetchCached(ctx(), 'src.txt', 'https://example.org/src', {}, validate)).rejects.toThrow('bad cache')
  })

  it('retries busy answers (429/502/503/504) with a growing delay, then succeeds', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(504))
      .mockResolvedValueOnce(reply(200, 'ok'))
    // refresh: skip the cache read (real file I/O) so the first retry timer is scheduled before the clock is advanced
    const result = fetchCached(ctx({ refresh: true }), 'src.txt', 'https://example.org/src')
    await vi.advanceTimersByTimeAsync(15_000)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await result).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('gives up after 3 attempts', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(reply(503))
    const result = fetchCached(ctx({ refresh: true }), 'src.txt', 'https://example.org/src')
    const assertion = expect(result).rejects.toThrow(/HTTP 503 \(attempt 3\/3\)/)
    await vi.advanceTimersByTimeAsync(45_000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry client errors', async () => {
    fetchMock.mockResolvedValue(reply(406))
    await expect(fetchCached(ctx(), 'src.txt', 'https://example.org/src')).rejects.toThrow(/HTTP 406 \(attempt 1\/3\)/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('fetchJsonCached', () => {
  it('parses JSON and validates the parsed value', async () => {
    fetchMock.mockResolvedValue(reply(200, '{"elements":[1,2]}'))
    const validate = vi.fn()
    expect(await fetchJsonCached(ctx(), 'x.json', 'https://example.org/x', undefined, validate)).toEqual({
      elements: [1, 2],
    })
    expect(validate).toHaveBeenCalledWith({ elements: [1, 2] })
  })
})
