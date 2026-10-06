import type { Server } from 'node:http'
import { logger } from './logger.js'

type ShutdownOptions = {
  server: Pick<Server, 'closeAllConnections'> & { close: (cb: () => void) => unknown }
  closeResources: () => Promise<void> // e.g. the DB pool: only after in-flight requests are done with it
  exit: (code: number) => void
  timeoutMs: number
}

// Graceful stop for SIGTERM/SIGINT: stop accepting connections, let running requests finish, then close resources.
// server.close() alone waits for every open request, so a stuck one would block a deploy forever: after timeoutMs
// the remaining connections are cut and the process exits 1.
export function createShutdown({ server, closeResources, exit, timeoutMs }: ShutdownOptions) {
  let started = false
  return () => {
    if (started) return
    started = true
    logger.info('Shutting down')
    const timer = setTimeout(() => {
      logger.error(`Requests still running after ${timeoutMs} ms, closing connections`)
      server.closeAllConnections()
      exit(1)
    }, timeoutMs)
    timer.unref()
    server.close(() => {
      clearTimeout(timer)
      closeResources().then(
        () => exit(0),
        (err: unknown) => {
          logger.error({ err }, 'Error while closing resources')
          exit(1)
        },
      )
    })
  }
}
