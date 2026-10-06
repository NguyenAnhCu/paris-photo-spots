// withTransaction with a fake client: no database needed (unit project, DATABASE_URL points nowhere on purpose).
import type pg from 'pg'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pool, withTransaction } from './pool.js'

function fakeClient(failing: Record<string, Error> = {}) {
  const client = {
    query: vi.fn(async (sql: string) => {
      const err = failing[sql]
      if (err) throw err
      return { rows: [] }
    }),
    release: vi.fn(),
  }
  vi.spyOn(pool, 'connect').mockResolvedValue(client as unknown as pg.PoolClient & never)
  return client
}

const sqlCalls = (client: ReturnType<typeof fakeClient>) => client.query.mock.calls.map(([sql]) => sql)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('withTransaction', () => {
  it('commits and returns the callback result, then releases the client', async () => {
    const client = fakeClient()
    await expect(withTransaction(async (c) => (await c.query('SELECT 1'), 'done'))).resolves.toBe('done')
    expect(sqlCalls(client)).toEqual(['BEGIN', 'SELECT 1', 'COMMIT'])
    expect(client.release).toHaveBeenCalledWith(undefined)
  })

  it('rolls back and rethrows the callback error; the healthy client goes back to the pool', async () => {
    const client = fakeClient()
    const boom = new Error('insert failed')
    await expect(withTransaction(() => Promise.reject(boom))).rejects.toBe(boom)
    expect(sqlCalls(client)).toEqual(['BEGIN', 'ROLLBACK'])
    expect(client.release).toHaveBeenCalledWith(undefined)
  })

  // Regression: a failing ROLLBACK (connection dropped mid-transaction) replaced the real error and the broken
  // client was returned to the pool for the next request.
  it('keeps the original error and discards the client when ROLLBACK itself fails', async () => {
    const lost = new Error('Connection terminated unexpectedly')
    const client = fakeClient({ ROLLBACK: lost })
    const boom = new Error('insert failed')
    await expect(withTransaction(() => Promise.reject(boom))).rejects.toBe(boom)
    expect(client.release).toHaveBeenCalledWith(lost)
  })
})
