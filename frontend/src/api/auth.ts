import { api, ApiError, keysToCamel } from './client'

// Identity of the current browser. Better Auth keeps it in an HttpOnly cookie: JavaScript never sees the session.
export type Me = {
  id: string
  name: string
  isAnonymous: boolean
  role: 'participant' | 'reviewer' | 'admin'
  hasRecoveryCode: boolean
  termsAccepted: boolean
  postingSuspendedUntil: string | null
  unreadDecisions: number
}
export type MeResponse = { user: Me | null; termsVersion: string }

// Better Auth routes live outside /api/v1 and answer errors as { code, message }.
async function authPost<T>(path: string, body: unknown = {}, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`/api/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const err = data as { code?: string; message?: string } | null
    throw new ApiError(err?.message ?? `HTTP ${res.status}`, res.status, err?.code)
  }
  return keysToCamel<T>(data)
}

const captchaHeader = (token?: string): Record<string, string> => (token ? { 'x-captcha-response': token } : {})

export const authApi = {
  me: (signal?: AbortSignal) => api.get<MeResponse>('/me', { signal }),
  acceptTerms: (version: string) => api.post<MeResponse>('/me/terms', { body: { version } }),
  rename: (name: string) => api.post<MeResponse>('/me/update', { body: { name } }),

  // The language picks the generated name ("Lữ khách 4821", "Traveller 4821").
  signInAnonymous: (lang: string, captcha?: string) =>
    authPost<unknown>('/sign-in/anonymous', {}, { 'x-ui-lang': lang, ...captchaHeader(captcha) }),
  createRecoveryCode: () => authPost<{ code: string }>('/recovery-code/create'),
  signInWithRecoveryCode: (code: string, captcha?: string) =>
    authPost<unknown>('/recovery-code/sign-in', { code }, captchaHeader(captcha)),
  signOut: () => authPost<unknown>('/sign-out'),
}
