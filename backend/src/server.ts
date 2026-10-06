import { createApp } from './app.js'
import { env } from './config/env.js'
import { pool } from './db/pool.js'
import { logger } from './lib/logger.js'
import { createShutdown } from './lib/shutdown.js'

// Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
const server = createApp().listen(env.PORT, (err?: Error) => {
  if (err) {
    logger.fatal({ err }, `Cannot listen on port ${env.PORT}`)
    process.exit(1)
  }
  logger.info(`API listening on http://localhost:${env.PORT}`)
})

const shutdown = createShutdown({
  server,
  closeResources: () => pool.end(),
  exit: (code) => process.exit(code),
  timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
})
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
