// UI state shared between the persistent map (MapLayout) and the routed panels (list, detail, photos, add).
import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { BBox, LngLat } from '@/lib/geo'
import type { ListScope } from '@/lib/listScope'
import type { SpotCategory } from '@/types/spot'

export type Placement = { position: LngLat | null; category: SpotCategory | null }

export type MapUi = {
  hoverId: string | null
  setHoverId: (id: string | null) => void
  focusSpot: (spot: { id: string; lng: number; lat: number }) => void
  // "Thêm mark": while a placement is active the map shows the draft pin and map clicks move it.
  placement: Placement | null
  setPlacement: Dispatch<SetStateAction<Placement | null>>
  mobileTab: 'list' | 'map'
  setMobileTab: (tab: 'list' | 'map') => void
  pickingOnMap: boolean // mobile/tablet: full-screen map to pick the location
  setPickingOnMap: (on: boolean) => void
  // Map area the user can see (desktop: not under the floating panel); null until the map has loaded.
  viewBounds: BBox | null
  listScope: ListScope // list: spots in the map area, or all of them
  setListScope: (scope: ListScope) => void
}

export const MapUiContext = createContext<MapUi | null>(null)

export function useMapUi(): MapUi {
  const ctx = useContext(MapUiContext)
  if (!ctx) throw new Error('useMapUi must be used inside MapLayout')
  return ctx
}

// Navigation that keeps the list filters (?cat=&q=&lang=) when moving between list, detail, photos and add.
export function useSpotNav() {
  const navigate = useNavigate()
  const { search } = useLocation()
  const go = (path: string, opts?: { replace?: boolean }) => navigate({ pathname: path, search }, opts)
  return {
    toList: () => go('/'),
    toSpot: (id: string, opts?: { replace?: boolean }) => go(`/spots/${id}`, opts),
    toPhotos: (id: string) => go(`/spots/${id}/photos`),
    toAddPhoto: (id: string) => go(`/spots/${id}/add-photo`),
    toAdd: () => go('/add'),
  }
}
