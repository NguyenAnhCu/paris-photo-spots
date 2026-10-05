import type pg from 'pg'
import { describe, expect, it, vi } from 'vitest'
import type { ImportContext } from './context.js'
import {
  assertNoShrink,
  assertNonEmpty,
  count,
  ImportAbortError,
  MIN_KEEP_RATIO,
  newStats,
  upsertOutcome,
} from './guards.js'

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  refresh: false,
  allowShrink: false,
  cacheDir: '/tmp',
  log: vi.fn(),
  ...over,
})
// Only the "last successful run" query is needed: a fake client answering it is enough.
const clientWithPrevious = (prev: number | null) =>
  ({ query: vi.fn().mockResolvedValue({ rows: prev === null ? [] : [{ prev }] }) }) as unknown as pg.ClientBase

describe('upsertOutcome / count', () => {
  it('reads RETURNING (xmax = 0) AS inserted: no row means unchanged', () => {
    expect(upsertOutcome([])).toBe('unchanged')
    expect(upsertOutcome([{ inserted: true }])).toBe('inserted')
    expect(upsertOutcome([{ inserted: false }])).toBe('updated')
  })

  it('counts outcomes into fresh stats', () => {
    const stats = newStats(3)
    count(stats, 'inserted')
    count(stats, 'unchanged')
    count(stats, 'unchanged')
    expect(stats).toEqual({ fetched: 3, inserted: 1, updated: 0, unchanged: 2, softDeleted: 0 })
  })
})

describe('assertNoShrink', () => {
  it('passes on the first run of a source', async () => {
    await expect(assertNoShrink(clientWithPrevious(null), ctx(), 'osm', 10)).resolves.toBeUndefined()
  })

  it(`passes at ${MIN_KEEP_RATIO * 100}% of the last successful download`, async () => {
    await expect(assertNoShrink(clientWithPrevious(1000), ctx(), 'osm', 800)).resolves.toBeUndefined()
  })

  it('aborts below the threshold (a partial download must not soft-delete POIs)', async () => {
    const run = assertNoShrink(clientWithPrevious(1000), ctx(), 'osm', 799)
    await expect(run).rejects.toBeInstanceOf(ImportAbortError)
    await expect(assertNoShrink(clientWithPrevious(1000), ctx(), 'osm', 799)).rejects.toThrow(/--allow-shrink/)
  })

  it('only warns when --allow-shrink was given', async () => {
    const context = ctx({ allowShrink: true })
    await expect(assertNoShrink(clientWithPrevious(1000), context, 'osm', 10)).resolves.toBeUndefined()
    expect(context.log).toHaveBeenCalledWith(expect.stringContaining('--allow-shrink'))
  })

  it('compares with the same source only', async () => {
    const client = clientWithPrevious(1000)
    await assertNoShrink(client, ctx(), 'museofile', 900)
    expect(vi.mocked(client.query).mock.calls[0]?.[1]).toEqual(['museofile'])
  })
})

describe('assertNonEmpty', () => {
  it('aborts on zero records', () => {
    expect(() => assertNonEmpty('idfm', 0)).toThrow(ImportAbortError)
    expect(() => assertNonEmpty('idfm', 1)).not.toThrow()
  })
})
