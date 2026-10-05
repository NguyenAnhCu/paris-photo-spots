// Lucide icons matching the hand-drawn set of the design (IC in the prototype was traced from these).
import {
  Building2,
  Compass,
  Heart,
  Landmark,
  LayoutGrid,
  Signpost,
  Sunset,
  TreeDeciduous,
  Waves,
  type LucideIcon,
} from 'lucide-react'
import type { SpotCategory } from '@/types/spot'

export const CATEGORY_ICON: Record<SpotCategory, LucideIcon> = {
  landmark: Landmark,
  street: Signpost,
  skyline: Sunset,
  bridge: Waves,
  park: TreeDeciduous,
  rooftop: Building2,
  wedding: Heart,
  suburb: Compass,
}

export const ALL_CATEGORIES_ICON = LayoutGrid
