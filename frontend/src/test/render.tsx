// Renders UI inside the providers the app uses (i18n, TanStack Query, router, map UI state) without the real map.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import { useState, type ReactElement, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AccountProvider } from '@/components/account/AccountProvider'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/translate'
import { MapUiContext, type MapUi, type Placement } from '@/pages/mapUi'
import type { SpotCollection, SpotSummary } from '@/types/spot'

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
}

// Real state for the map UI context, so components that write to it (placement, picking on map) behave as in the app.
function MapUiState({ initial, children }: { initial?: Partial<MapUi>; children: ReactNode }) {
  const [hoverId, setHoverId] = useState<string | null>(initial?.hoverId ?? null)
  const [placement, setPlacement] = useState<Placement | null>(initial?.placement ?? null)
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>(initial?.mobileTab ?? 'list')
  const [pickingOnMap, setPickingOnMap] = useState(initial?.pickingOnMap ?? false)
  const value: MapUi = {
    hoverId,
    setHoverId,
    focusSpot: initial?.focusSpot ?? (() => {}),
    placement,
    setPlacement,
    mobileTab,
    setMobileTab,
    pickingOnMap,
    setPickingOnMap,
  }
  return (
    <MapUiContext.Provider value={value}>
      {children}
      <MapUiProbe value={value} />
    </MapUiContext.Provider>
  )
}

// Exposes the current map UI state to assertions (screen.getByTestId('map-ui').dataset…).
function MapUiProbe({ value }: { value: MapUi }) {
  return (
    <output
      data-testid="map-ui"
      data-placement={JSON.stringify(value.placement)}
      data-picking={String(value.pickingOnMap)}
      hidden
    />
  )
}

// Shows where the router is, for navigation assertions.
function LocationProbe() {
  const { pathname, search } = useLocation()
  return <output data-testid="location" data-path={pathname} data-search={search} hidden />
}

type Options = {
  route?: string
  path?: string // route pattern when the component reads params (e.g. "/spots/:id")
  locale?: Locale
  mapUi?: Partial<MapUi>
  queryClient?: QueryClient
} & Omit<RenderOptions, 'wrapper'>

export function renderWithApp(ui: ReactElement, opts: Options = {}) {
  const { route = '/', path, locale = 'vi', mapUi, queryClient = createTestQueryClient(), ...rest } = opts
  const element = (
    <>
      {ui}
      <LocationProbe />
    </>
  )
  const result = render(
    <I18nProvider initialLocale={locale}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <MapUiState initial={mapUi}>
            <AccountProvider>
              <Routes>
                <Route path={path ?? '*'} element={element} />
                {path && <Route path="*" element={<LocationProbe />} />}
              </Routes>
            </AccountProvider>
          </MapUiState>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
    rest,
  )
  return { ...result, queryClient }
}

export const currentLocation = (el: HTMLElement) => ({ path: el.dataset.path, search: el.dataset.search })

export function spot(overrides: Partial<SpotSummary> = {}): SpotSummary {
  return {
    id: 'spot-1',
    name: 'Pont Alexandre III',
    photoCategory: 'bridge',
    crowdLevel: 2,
    bestTime: null,
    coverThumbUrl: null,
    photoCount: 0,
    ...overrides,
  }
}

export function collection(spots: SpotSummary[]): SpotCollection {
  return {
    type: 'FeatureCollection',
    features: spots.map((s, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2.3 + i / 100, 48.86] },
      properties: s,
    })),
  }
}

// Answers fetch() by URL path + method; anything unexpected fails the test loudly.
type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>
export function fakeFetch(routes: Record<string, Handler>) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
    const key = `${init?.method ?? 'GET'} ${url.pathname}`
    const handler = routes[key]
    if (!handler) throw new Error(`Unexpected request ${key}`)
    return handler(url, init)
  }
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// A fake identity backend (GET /api/v1/me, anonymous sign-in, terms, recovery code) to merge into fakeFetch routes.
// `calls` records what the UI asked for, in order.
export type IdentityUser = {
  name: string
  termsAccepted: boolean
  hasRecoveryCode: boolean
  role?: 'participant' | 'reviewer' | 'admin'
  unreadDecisions?: number
}
export type IdentityState = { user: null | IdentityUser }
export function identityServer(initial: IdentityState['user'] = null) {
  // A copy: tests share their starting user objects, and the fake server mutates its state (rename, sign-out).
  const state: IdentityState = { user: initial && { ...initial } }
  const calls: string[] = []
  const me = () =>
    json(200, {
      user: state.user && {
        id: 'me-1',
        name: state.user.name,
        is_anonymous: (state.user.role ?? 'participant') === 'participant',
        role: state.user.role ?? 'participant',
        has_recovery_code: state.user.hasRecoveryCode,
        terms_accepted: state.user.termsAccepted,
        posting_suspended_until: null,
        unread_decisions: state.user.unreadDecisions ?? 0,
      },
      terms_version: 'draft-1',
    })
  const routes: Record<string, Handler> = {
    'GET /api/v1/me': () => me(),
    'POST /api/auth/sign-in/anonymous': (_url, init) => {
      calls.push(`sign-in/anonymous lang=${new Headers(init?.headers).get('x-ui-lang')}`)
      state.user = { name: 'Lữ khách 4821', termsAccepted: false, hasRecoveryCode: false }
      return json(200, { token: 'x', user: { id: 'me-1' } })
    },
    'POST /api/v1/me/terms': (_url, init) => {
      calls.push(`terms ${String((JSON.parse(String(init?.body)) as { version: string }).version)}`)
      if (state.user) state.user.termsAccepted = true
      return me()
    },
    'POST /api/v1/me/update': (_url, init) => {
      const name = String((JSON.parse(String(init?.body)) as { name: string }).name).trim()
      calls.push(`rename ${name}`)
      if (name.toLowerCase() === 'admin') {
        return json(400, { error: { code: 'INVALID_NAME', message: 'This name cannot be used', status: 400 } })
      }
      if (state.user) state.user.name = name
      return me()
    },
    'POST /api/auth/sign-out': () => {
      calls.push('sign-out')
      state.user = null
      return json(200, { success: true })
    },
    'POST /api/auth/recovery-code/sign-in': (_url, init) => {
      const code = String((JSON.parse(String(init?.body)) as { code: string }).code)
      calls.push(`recovery-code/sign-in ${code}`)
      if (code.replace(/[\s-]/g, '').toUpperCase() !== 'AB12CD34EF56GH78') {
        return json(401, { code: 'INVALID_RECOVERY_CODE', message: 'Invalid recovery code' })
      }
      state.user = { name: 'Lữ khách 4821', termsAccepted: true, hasRecoveryCode: true }
      return json(200, { ok: true })
    },
    // Staff accounts: admin / admin (admin), linh / secret pass (reviewer); "flood" is rate limited.
    'POST /api/auth/sign-in/username': (_url, init) => {
      const { username, password } = JSON.parse(String(init?.body)) as { username: string; password: string }
      calls.push(`sign-in/username ${username}`)
      if (username === 'flood') {
        return json(429, { error: { code: 'RATE_LIMITED', message: 'Too many requests', status: 429 } })
      }
      if (username.trim().length < 3) return json(422, { code: 'USERNAME_TOO_SHORT', message: 'Username is too short' })
      const accounts: Record<string, [string, IdentityUser]> = {
        admin: ['admin', { name: 'Admin', termsAccepted: false, hasRecoveryCode: false, role: 'admin' }],
        linh: ['secret pass', { name: 'Linh', termsAccepted: false, hasRecoveryCode: false, role: 'reviewer' }],
      }
      const account = accounts[username.trim().toLowerCase()]
      if (!account || account[0] !== password) {
        return json(401, { code: 'INVALID_USERNAME_OR_PASSWORD', message: 'Invalid username or password' })
      }
      state.user = { ...account[1] }
      return json(200, { token: 'x', user: { id: 'me-1' } })
    },
    'POST /api/auth/recovery-code/create': () => {
      calls.push('recovery-code/create')
      if (state.user) state.user.hasRecoveryCode = true
      return json(200, { code: 'AB12-CD34-EF56-GH78' })
    },
  }
  return { routes, calls, state }
}
