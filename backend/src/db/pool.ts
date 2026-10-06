import pg from 'pg'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECT_TIMEOUT_MS,
  // Caps runaway spatial/tile queries server-side so one heavy request cannot hold a connection indefinitely.
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
})

// Without a listener, an idle client dropped by the server (DB restart, network blip) emits an
// unhandled 'error' event and crashes the process. The pool discards that client and reconnects on demand.
pool.on('error', (err) => {
  logger.error({ err }, 'Idle PostgreSQL client error')
})

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  // Set when the connection is unusable: release(err) destroys it instead of handing it to the next request.
  let broken: Error | undefined
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    // A failed ROLLBACK (connection dropped mid-transaction) must not hide the error that caused it.
    await client.query('ROLLBACK').catch((rollbackErr: unknown) => {
      logger.error({ err: rollbackErr }, 'ROLLBACK failed, discarding the connection')
      broken = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr))
    })
    throw err
  } finally {
    client.release(broken)
  }
}
