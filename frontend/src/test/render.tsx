// Renders UI inside the providers the app uses (i18n, TanStack Query, router, map UI state) without the real map.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import { useState, type ReactElement, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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
            <Routes>
              <Route path={path ?? '*'} element={element} />
              {path && <Route path="*" element={<LocationProbe />} />}
            </Routes>
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
