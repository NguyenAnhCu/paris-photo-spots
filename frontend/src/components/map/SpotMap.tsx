// Map of photo spots with @vis.gl/react-maplibre. Declarative: data and highlight come from props; the camera is
// driven through the map ref only for intentional moves (open a spot, expand a cluster).
import {
  AttributionControl,
  Layer,
  Map,
  Marker,
  NavigationControl,
  Source,
  type LayerProps,
  type MapLayerMouseEvent,
  type MapRef,
} from '@vis.gl/react-maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import './maplibreWorker'
import type { ExpressionSpecification, GeoJSONSource } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { config } from '@/config'
import { useI18n } from '@/i18n/useI18n'
import type { LngLat } from '@/lib/geo'
import { SPOT_CATEGORIES, type SpotCategory, type SpotCollection } from '@/types/spot'
import { PIN_COLOR, pinSvg, registerPinImages } from './pins'
import './SpotMap.css'

export type MapFocus = { lng: number; lat: number; zoom?: number; key: string }

type SpotMapProps = {
  spots: SpotCollection | undefined
  activeIds: string[] // selected + hovered → clay pins on top
  focus: MapFocus | null // changes → fly there
  leftPadding: number // desktop: width covered by the floating panel
  showZoom: boolean
  draft?: { position: LngLat | null; category: SpotCategory | null } // "Thêm mark" placement
  onSelect: (id: string) => void
  onHover?: (id: string | null) => void
  onPlace?: (position: LngLat) => void // set when the map is in placement mode
}

const SOURCE_ID = 'spots'
const CLUSTERS = 'spot-clusters'
const CLUSTER_COUNT = 'spot-cluster-count'
const PINS = 'spot-pins'
const PINS_ACTIVE = 'spot-pins-active'
const CLUSTER_MAX_ZOOM = 13
const CLUSTER_RADIUS = 46
const FLY_DURATION_MS = 800

const clusterLayer: LayerProps = {
  id: CLUSTERS,
  type: 'circle',
  source: SOURCE_ID,
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': PIN_COLOR.normal,
    'circle-radius': ['step', ['get', 'point_count'], 17, 10, 21, 40, 26],
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2.5,
  },
}

const clusterCountLayer: LayerProps = {
  id: CLUSTER_COUNT,
  type: 'symbol',
  source: SOURCE_ID,
  filter: ['has', 'point_count'],
  layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13 },
  paint: { 'text-color': '#ffffff' },
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function SpotMap({
  spots,
  activeIds,
  focus,
  leftPadding,
  showZoom,
  draft,
  onSelect,
  onHover,
  onPlace,
}: SpotMapProps) {
  const { t } = useI18n()
  const mapRef = useRef<MapRef>(null)
  const [imagesReady, setImagesReady] = useState(false)
  const hovered = useRef<string | null>(null)

  const pinLayers = useMemo((): LayerProps[] => {
    const active: ExpressionSpecification = ['in', ['get', 'id'], ['literal', activeIds]]
    const notCluster: ExpressionSpecification = ['!', ['has', 'point_count']]
    // Image ids follow pinImageId(): pin-normal-<category> / pin-active-<category>.
    const iconImage = (isActive: boolean): ExpressionSpecification => [
      'concat',
      isActive ? 'pin-active-' : 'pin-normal-',
      ['get', 'photoCategory'],
    ]
    const common = { 'icon-allow-overlap': true, 'icon-anchor': 'bottom' } as const
    return [
      {
        id: PINS,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['all', notCluster, ['!', active]],
        layout: { ...common, 'icon-image': iconImage(false) },
      },
      {
        id: PINS_ACTIVE,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['all', notCluster, active],
        layout: { ...common, 'icon-image': iconImage(true) },
      },
    ]
  }, [activeIds])

  // Camera moves are intentional only: opening a spot (focus.key changes) — not every re-render.
  // A shared link can deliver the spot before the map exists: handleLoad replays the latest focus then.
  const pendingFocus = useRef<MapFocus | null>(null)
  const flyToFocus = useCallback(
    (target: MapFocus) => {
      mapRef.current?.flyTo({
        center: [target.lng, target.lat],
        zoom: Math.max(mapRef.current.getZoom(), target.zoom ?? config.spotZoom),
        padding: { left: leftPadding, top: 0, right: 0, bottom: 0 },
        duration: prefersReducedMotion() ? 0 : FLY_DURATION_MS,
      })
    },
    [leftPadding],
  )
  useEffect(() => {
    if (!focus) return
    if (mapRef.current) flyToFocus(focus)
    else pendingFocus.current = focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key])

  // The panel width changes with the breakpoint: keep the visual centre consistent.
  useEffect(() => {
    mapRef.current?.getMap().setPadding({ left: leftPadding, top: 0, right: 0, bottom: 0 })
  }, [leftPadding])

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    // MapLibre opens the compact attribution on load; closed it is an (i) button instead of a line across the pins.
    map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
    if (pendingFocus.current) {
      flyToFocus(pendingFocus.current)
      pendingFocus.current = null
    }
    registerPinImages(map, SPOT_CATEGORIES)
      .then(() => setImagesReady(true))
      .catch((err: unknown) => console.error('Pin images failed', err))
  }, [flyToFocus])

  const handleClick = useCallback(
    async (e: MapLayerMouseEvent) => {
      if (onPlace) {
        onPlace([e.lngLat.lng, e.lngLat.lat])
        return
      }
      const feature = e.features?.[0]
      if (!feature) return
      if (feature.layer.id === CLUSTERS) {
        const source = mapRef.current?.getMap().getSource<GeoJSONSource>(SOURCE_ID)
        const clusterId = feature.properties?.cluster_id as number | undefined
        if (!source || clusterId === undefined || feature.geometry.type !== 'Point') return
        const zoom = await source.getClusterExpansionZoom(clusterId)
        mapRef.current?.easeTo({
          center: feature.geometry.coordinates as [number, number],
          zoom,
          duration: prefersReducedMotion() ? 0 : 500,
        })
        return
      }
      const id = feature.properties?.id as string | undefined
      if (id) onSelect(id)
    },
    [onPlace, onSelect],
  )

  const handleMove = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      const id =
        feature && feature.layer.id !== CLUSTERS ? ((feature.properties?.id as string | undefined) ?? null) : null
      const canvas = mapRef.current?.getMap().getCanvas()
      if (canvas) canvas.style.cursor = onPlace ? 'crosshair' : feature ? 'pointer' : ''
      if (hovered.current !== id) {
        hovered.current = id
        onHover?.(id)
      }
    },
    [onHover, onPlace],
  )

  const draftPosition = draft?.position ?? null
  const draftCategory = draft?.category ?? null
  const draftPin = useMemo(
    () =>
      draftPosition
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg(draftCategory ?? 'add', 40, PIN_COLOR.draft))}`
        : null,
    [draftPosition, draftCategory],
  )

  return (
    <div className="spot-map" role="region" aria-label={t('map.label')}>
      <Map
        ref={mapRef}
        mapStyle={config.mapStyleUrl}
        initialViewState={{
          longitude: config.defaultCenter[0],
          latitude: config.defaultCenter[1],
          zoom: config.defaultZoom,
          padding: { left: leftPadding, top: 0, right: 0, bottom: 0 },
        }}
        minZoom={config.minZoom}
        maxZoom={config.maxZoom}
        maxBounds={config.maxBounds}
        interactiveLayerIds={imagesReady ? [CLUSTERS, PINS, PINS_ACTIVE] : []}
        onLoad={handleLoad}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={() => onHover?.(null)}
        attributionControl={false}
        locale={{
          'NavigationControl.ZoomIn': t('map.control.zoomIn'),
          'NavigationControl.ZoomOut': t('map.control.zoomOut'),
          'NavigationControl.ResetBearing': t('map.control.resetBearing'),
          'Popup.Close': t('map.control.popupClose'),
        }}
      >
        {showZoom && <NavigationControl position="bottom-right" showCompass={false} />}
        <AttributionControl position="bottom-right" compact customAttribution="Photos © Wikimedia Commons" />
        {imagesReady && spots && (
          <Source
            id={SOURCE_ID}
            type="geojson"
            data={spots}
            cluster
            clusterMaxZoom={CLUSTER_MAX_ZOOM}
            clusterRadius={CLUSTER_RADIUS}
          >
            <Layer {...clusterLayer} />
            <Layer {...clusterCountLayer} />
            {pinLayers.map((l) => (
              <Layer key={l.id} {...l} />
            ))}
          </Source>
        )}
        {draft?.position && draftPin && (
          <Marker longitude={draft.position[0]} latitude={draft.position[1]} anchor="bottom">
            <img src={draftPin} alt="" width={46} height={58} />
          </Marker>
        )}
      </Map>
    </div>
  )
}
