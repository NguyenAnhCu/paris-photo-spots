// Persistent shell: the map never unmounts while panels change with the route. Desktop (≥1000px): full-bleed map +
// floating top bar + left panel. Tablet/mobile: header + content column, "Danh sách | Bản đồ" switch (F4).
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useMatch } from 'react-router-dom'
import type { MapFocus } from '@/components/map/SpotMap'
import { MobileHeader, BottomSegmented, MiniSpotCard, PlacingBar } from '@/components/spots/MobileChrome'
import { TopBar } from '@/components/spots/TopBar'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { useFilteredSpots, useSpotFilters } from '@/hooks/useSpotFilters'
import { useSpots } from '@/hooks/useSpots'
import { MapUiContext, useSpotNav, type MapUi, type Placement } from './mapUi'
import './MapLayout.css'

// MapLibre (~300 KB gzip) is a chunk of its own, requested only after the first paint: evaluating it and creating
// the WebGL context keeps the main thread busy, so the list and the top bar are painted first and the map fills in
// behind them a moment later.
// The download starts right away (in parallel with the spots request); only mounting waits for the first paint.
const spotMapModule = import('@/components/map/SpotMap')
const SpotMap = lazy(() => spotMapModule.then((m) => ({ default: m.SpotMap })))

const PANEL_COVERAGE_PX = 456 // panel 440 + 16 gap (design: "dịch tâm sang phải 228px" = half of it)

export function MapLayout() {
  const bp = useBreakpoint()
  const isDesktop = bp === 'desktop'
  const nav = useSpotNav()
  const spotMatch = useMatch('/spots/:id/*')
  const listMatch = useMatch('/')
  const selectedId = spotMatch?.params.id ?? null

  const { data: spots } = useSpots()
  const { category, query } = useSpotFilters()
  const visible = useFilteredSpots(spots, category, query)
  const visibleCollection = useMemo(() => (spots ? { ...spots, features: visible } : undefined), [spots, visible])

  const [hoverId, setHoverId] = useState<string | null>(null)
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list')
  const [mobileSelected, setMobileSelected] = useState<string | null>(null)
  const [pickingOnMap, setPickingOnMap] = useState(false)
  const mapAllowed = useAfterFirstPaint()

  const focusSpot = useCallback((s: { id: string; lng: number; lat: number }) => {
    setFocus({ lng: s.lng, lat: s.lat, key: `${s.id}:${Date.now()}` })
  }, [])

  const ui: MapUi = useMemo(
    () => ({
      hoverId,
      setHoverId,
      focusSpot,
      placement,
      setPlacement,
      mobileTab,
      setMobileTab,
      pickingOnMap,
      setPickingOnMap,
    }),
    [hoverId, focusSpot, placement, mobileTab, pickingOnMap],
  )

  // Desktop: a pin opens the detail panel. Mobile/tablet: it selects the spot and shows the mini card.
  const onSelect = useCallback(
    (id: string) => {
      if (isDesktop) nav.toSpot(id)
      else {
        setMobileSelected(id)
        const f = spots?.features.find((x) => x.properties.id === id)
        if (f) focusSpot({ id, lng: f.geometry.coordinates[0] ?? 0, lat: f.geometry.coordinates[1] ?? 0 })
      }
    },
    [isDesktop, nav, spots, focusSpot],
  )

  const activeIds = [isDesktop ? selectedId : mobileSelected, hoverId].filter((x): x is string => Boolean(x))
  const placing = placement !== null
  const mapVisible = isDesktop || pickingOnMap || (Boolean(listMatch) && mobileTab === 'map')
  const miniSpot =
    !isDesktop && listMatch && mobileTab === 'map' ? visible.find((f) => f.properties.id === mobileSelected) : undefined

  return (
    <MapUiContext.Provider value={ui}>
      <div className={`layout layout--${bp}`}>
        {!isDesktop && !pickingOnMap && <MobileHeader />}
        <div className="layout__stage">
          {isDesktop && <TopBar />}
          {/* Unstyled landmark: panels/columns stay positioned against .layout__stage. */}
          <main>
            <Outlet />
            {miniSpot && <MiniSpotCard spot={miniSpot.properties} onOpen={() => nav.toSpot(miniSpot.properties.id)} />}
            {pickingOnMap && <PlacingBar />}
          </main>
          {/* After the content in DOM order so Tab reaches the top bar and the list first (z-index keeps it underneath). */}
          <div className="layout__map" data-visible={mapVisible}>
            {mapAllowed && (
              <Suspense fallback={null}>
                <SpotMap
                  spots={visibleCollection}
                  activeIds={activeIds}
                  focus={focus}
                  leftPadding={isDesktop ? PANEL_COVERAGE_PX : 0}
                  showZoom={bp !== 'mobile'}
                  draft={placement ?? undefined}
                  onSelect={onSelect}
                  onHover={isDesktop ? setHoverId : undefined}
                  onPlace={
                    placing && (isDesktop || pickingOnMap)
                      ? (p) => setPlacement((cur) => (cur ? { ...cur, position: p } : cur))
                      : undefined
                  }
                />
              </Suspense>
            )}
          </div>
          {!isDesktop && listMatch && !pickingOnMap && <BottomSegmented />}
        </div>
      </div>
    </MapUiContext.Provider>
  )
}

// True from the second animation frame on: the first frame with the page content has been painted by then.
function useAfterFirstPaint(): boolean {
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setPainted(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [])
  return painted
}
