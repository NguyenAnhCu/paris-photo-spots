// Better Auth instance (decision 2026-10-07, checked in a spike first). Tables are ours (snake_case,
// no foreign keys, migration 1759795200000_auth-identity.sql) and mapped field by field below.
import { betterAuth, type BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { anonymous, captcha, magicLink } from 'better-auth/plugins'
import { corsOrigins, env } from '../../config/env.js'
import { pool } from '../../db/pool.js'
import { logger } from '../../lib/logger.js'
import { RecoveryCodeSignInBody } from './auth.schemas.js'
import { authService } from './auth.service.js'

const DAY_SECONDS = 24 * 60 * 60

// Lets an anonymous participant get the same identity back in another browser or after clearing site data.
const recoveryCode = () =>
  ({
    id: 'recovery-code',
    endpoints: {
      createRecoveryCode: createAuthEndpoint(
        '/recovery-code/create',
        { method: 'POST', use: [sessionMiddleware] },
        async (ctx) => ctx.json({ code: await authService.createRecoveryCode(ctx.context.session.user.id) }),
      ),
      signInWithRecoveryCode: createAuthEndpoint(
        '/recovery-code/sign-in',
        { method: 'POST', body: RecoveryCodeSignInBody },
        async (ctx) => {
          const userId = await authService.userIdForRecoveryCode(ctx.body.code)
          const user = userId ? await ctx.context.internalAdapter.findUserById(userId) : null
          if (!user)
            throw new APIError('UNAUTHORIZED', { message: 'Invalid recovery code', code: 'INVALID_RECOVERY_CODE' })
          const session = await ctx.context.internalAdapter.createSession(user.id)
          await setSessionCookie(ctx, { session, user })
          return ctx.json({ ok: true })
        },
      ),
    },
  }) satisfies BetterAuthPlugin

const turnstile = env.TURNSTILE_SECRET_KEY
  ? [
      captcha({
        provider: 'cloudflare-turnstile',
        secretKey: env.TURNSTILE_SECRET_KEY,
        endpoints: ['/sign-in/anonymous', '/recovery-code/sign-in'],
      }),
    ]
  : []

const at = (columns: Record<string, string>) => columns

export const auth = betterAuth({
  database: pool,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.PUBLIC_ORIGIN,
  basePath: '/api/auth',
  trustedOrigins: [...new Set([env.PUBLIC_ORIGIN, ...corsOrigins])],
  telemetry: { enabled: false },
  logger: {
    disabled: env.NODE_ENV === 'test',
    log: (level, message, ...args) => logger[level]({ args }, `[auth] ${message}`),
  },
  // Name changes go through /api/v1/me/update (validated); account deletion must also handle content (later phase).
  disabledPaths: ['/update-user', '/delete-user', '/change-email', '/delete-anonymous-user'],
  session: {
    modelName: 'auth_sessions',
    expiresIn: env.SESSION_EXPIRES_DAYS * DAY_SECONDS,
    updateAge: env.SESSION_UPDATE_AGE_HOURS * 60 * 60,
    fields: at({
      userId: 'user_id',
      expiresAt: 'expires_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }),
  },
  user: {
    modelName: 'users',
    fields: at({
      name: 'display_name',
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }),
    additionalFields: { role: { type: 'string', required: false, defaultValue: 'participant', input: false } },
  },
  account: {
    modelName: 'auth_accounts',
    fields: at({
      userId: 'user_id',
      accountId: 'account_id',
      providerId: 'provider_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }),
  },
  verification: {
    modelName: 'auth_verifications',
    fields: at({ expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at' }),
  },
  advanced: { database: { generateId: 'uuid' } },
  // Off: per-IP limits are express-rate-limit in auth.routes.ts (Better Auth's limiter shared one bucket between all
  // clients when no forwarded-IP header was present).
  rateLimit: { enabled: false },
  plugins: [
    anonymous({
      schema: { user: { fields: { isAnonymous: 'is_anonymous' } } },
      // The web app sends its language so the generated name reads naturally ("Lữ khách 4821", "Traveller 4821").
      generateName: (ctx) => authService.anonymousName(ctx.request?.headers.get('x-ui-lang') ?? 'vi'),
      onLinkAccount: ({ anonymousUser, newUser }) =>
        authService.onAnonymousLinked(anonymousUser.user.id, newUser.user.id),
    }),
    recoveryCode(),
    // Staff only for now: accounts are created by an admin (no self sign-up through a link).
    magicLink({
      disableSignUp: true,
      expiresIn: 15 * 60,
      sendMagicLink: ({ email, url }) => authService.deliverMagicLink(email, url),
    }),
    ...turnstile,
  ],
})
