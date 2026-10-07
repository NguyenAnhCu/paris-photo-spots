import compression from 'compression'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { corsOrigins, env } from './config/env.js'
import { logger } from './lib/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { originCheck } from './middleware/originCheck.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { healthRouter } from './modules/health/health.routes.js'
import { meRouter } from './modules/me/me.routes.js'
import { photoRouter } from './modules/photos/photo.routes.js'
import { poiRouter } from './modules/pois/poi.routes.js'
import { regionRouter } from './modules/regions/region.routes.js'
import { spotRouter } from './modules/spots/spot.routes.js'
import { tileRouter } from './modules/tiles/tile.routes.js'
import { MEDIA_URL_PREFIX, STORAGE_ROOT } from './storage/photoStorage.js'

export function createApp() {
  const app = express()

  app.use(helmet())
  // credentials: the session cookie, for a web app served from another origin than the API (same origin in our setups).
  app.use(cors({ origin: corsOrigins, credentials: true }))
  app.use(compression())
  app.use(pinoHttp({ logger }))
  // Better Auth parses its own body: before express.json().
  app.use('/api/auth', authRouter)
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }))

  const api = express.Router()
  api.use(originCheck([env.PUBLIC_ORIGIN, ...corsOrigins]))
  api.use('/health', healthRouter)
  api.use('/me', meRouter)
  api.use('/pois', poiRouter)
  api.use('/regions', regionRouter)
  api.use('/spots', spotRouter)
  api.use('/photos', photoRouter)
  app.use('/api/v1', api)

  app.use('/tiles', tileRouter)
  // Uploaded photos. File names are random UUIDs and never overwritten → safe to cache "forever".
  app.use(
    MEDIA_URL_PREFIX,
    express.static(STORAGE_ROOT, {
      maxAge: env.MEDIA_CACHE_SECONDS * 1000,
      immutable: true,
      index: false,
      dotfiles: 'deny',
      fallthrough: true,
    }),
  )

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
