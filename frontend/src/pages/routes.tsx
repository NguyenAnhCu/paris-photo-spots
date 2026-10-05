// Route pages: pick the desktop panel or the tablet/mobile page variant of each view.
import { useParams } from 'react-router-dom'
import { AddPhotoForm, AddSpotForm } from '../components/spots/AddForms'
import { SpotPanel } from '../components/spots/SpotDetail'
import { SpotList } from '../components/spots/SpotList'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useMapUi } from './mapUi'

function useLayout(): 'panel' | 'page' {
  return useBreakpoint() === 'desktop' ? 'panel' : 'page'
}

export function ListRoute() {
  const layout = useLayout()
  const { mobileTab } = useMapUi()
  if (layout === 'page' && mobileTab === 'map') return null // the map itself is the view
  return <SpotList layout={layout === 'panel' ? 'panel' : 'column'} />
}

export function SpotRoute({ view }: { view: 'detail' | 'photos' }) {
  const layout = useLayout()
  const { id = '' } = useParams()
  return <SpotPanel key={`${id}:${view}`} spotId={id} layout={layout} view={view} />
}

export function AddSpotRoute() {
  const layout = useLayout()
  const { pickingOnMap } = useMapUi()
  // Mobile "Chọn trên bản đồ": keep the form mounted (state survives) but hidden behind the full-screen map.
  return (
    <div hidden={pickingOnMap}>
      <AddSpotForm layout={layout} />
    </div>
  )
}

export function AddPhotoRoute() {
  const layout = useLayout()
  const { id = '' } = useParams()
  return <AddPhotoForm spotId={id} layout={layout} />
}
