import { toNodeHandler } from 'better-auth/node'
import { Router } from 'express'
import { authRateLimit } from '../../middleware/rateLimit.js'
import { auth } from './auth.js'

// Better Auth reads the raw body itself: mounted in app.ts before express.json().
export const authRouter = Router()
authRouter.post(['/sign-in/anonymous', '/recovery-code/sign-in', '/sign-in/username'], authRateLimit)
authRouter.all('/*splat', toNodeHandler(auth))
