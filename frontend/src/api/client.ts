import { config } from '@/config'

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

function convertKeys(value: unknown, convert: (k: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => convertKeys(v, convert))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [convert(k), convertKeys(v, convert)]))
  }
  return value
}

export const keysToCamel = <T>(value: unknown) => convertKeys(value, toCamel) as T
export const keysToSnake = (value: unknown) => convertKeys(value, toSnake) as Json

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details: unknown[] = [],
  ) {
    super(message)
  }
}

type Query = Record<string, string | number | undefined>
type RequestOptions = { query?: Query; body?: unknown; form?: FormData; signal?: AbortSignal }

function buildUrl(path: string, query: Query = {}): URL {
  const url = new URL(`${config.apiBaseUrl}/api/v1${path}`, window.location.origin)
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') url.searchParams.set(toSnake(k), String(v))
  }
  return url
}

async function request<T>(method: 'GET' | 'POST', path: string, opts: RequestOptions = {}): Promise<T> {
  // Multipart bodies are sent as-is: the browser sets the boundary header, and form field names are already
  // snake_case at the call site (api/photos.ts).
  const body = opts.form ?? (opts.body ? JSON.stringify(keysToSnake(opts.body)) : undefined)
  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers: opts.body && !opts.form ? { 'Content-Type': 'application/json' } : undefined,
    body,
    signal: opts.signal,
  })
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string; details?: unknown[] } } | null)?.error
    // UI shows translateApiError(), not this message; the backend message is kept for logs/debugging.
    throw new ApiError(err?.message ?? `HTTP ${res.status}`, res.status, err?.code, err?.details ?? [])
  }
  return keysToCamel<T>(data)
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  post: <T>(path: string, opts?: RequestOptions) => request<T>('POST', path, opts),
  postForm: <T>(path: string, form: FormData, signal?: AbortSignal) => request<T>('POST', path, { form, signal }),
}

// Media files (uploaded photos) are served by the backend outside /api/v1.
export const mediaUrl = (path: string) => (path.startsWith('http') ? path : `${config.apiBaseUrl}${path}`)
