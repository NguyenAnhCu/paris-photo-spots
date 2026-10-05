// Teardrop pins from the design (`pin()` in the prototype): steel fill, white 2.5px border, white category icon;
// hovered/selected pins turn clay and grow 32 → 40px. Drawn as SVG images for a MapLibre symbol layer (hundreds of
// DOM markers re-created on every state change is too slow).
// Raw colours: MapLibre images cannot read CSS variables — keep in sync with tokens.css (--accent, --clay).
import type { SpotCategory } from '@/types/spot'

export const PIN_COLOR = { normal: '#5980a6', active: '#c4825a', draft: '#c4825a', empty: '#98989b' } as const
export const PIN_SIZE = { normal: 32, active: 40 } as const
const PIXEL_RATIO = 2

// Lucide paths (24×24 viewBox), as used by the design's icon set.
export const CATEGORY_ICON_PATHS: Record<SpotCategory | 'add', string> = {
  landmark: '<path d="M3 21h18M5 21V9M19 21V9M3 9l9-6 9 6M9 21v-7h6v7"/>',
  street:
    '<path d="M12 13v8M12 3v3"/><path d="M18 6a2 2 0 0 1 1.39.56l2.3 2.22a1 1 0 0 1 0 1.44l-2.3 2.22A2 2 0 0 1 18 13H6a2 2 0 0 1-1.39-.56l-2.3-2.22a1 1 0 0 1 0-1.44l2.3-2.22A2 2 0 0 1 6 6z"/>',
  skyline:
    '<path d="M12 2v4M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M16 18a4 4 0 0 0-8 0"/>',
  bridge:
    '<path d="M2 8c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 16c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  park: '<circle cx="12" cy="9" r="6.5"/><path d="M12 15.5V22M8.5 22h7"/>',
  rooftop:
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4"/>',
  wedding:
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>',
  suburb:
    '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.8 5.41a2 2 0 0 1-1.27 1.27L7.76 16.24l1.8-5.41a2 2 0 0 1 1.27-1.27z"/>',
  add: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/>',
}

// Pin geometry in a size×(size*1.25) box: circle of radius ~size/2 with the point at the bottom centre.
export function pinSvg(icon: SpotCategory | 'add', size: number, fill: string, scale = 1): string {
  const w = size + 6 // room for the white border + shadow
  const h = Math.round(size * 1.3) + 6
  const cx = w / 2
  const r = size / 2 - 1.5
  const cy = r + 3
  const tipY = h - 4
  const icon24 = size * 0.58
  const k = icon24 / 24
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}">
  <defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#1d1f20" flood-opacity="0.32"/></filter></defs>
  <path filter="url(#s)" d="M${cx} ${tipY} C ${cx - r * 0.35} ${cy + r * 1.05} ${cx - r} ${cy + r * 0.55} ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} C ${cx + r} ${cy + r * 0.55} ${cx + r * 0.35} ${cy + r * 1.05} ${cx} ${tipY} Z" fill="${fill}" stroke="#ffffff" stroke-width="2.5"/>
  <g transform="translate(${cx - icon24 / 2} ${cy - icon24 / 2}) scale(${k})" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${CATEGORY_ICON_PATHS[icon]}</g>
</svg>`
}

export const pinImageId = (category: SpotCategory, active: boolean) => `pin-${active ? 'active' : 'normal'}-${category}`

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Pin image failed to load'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

type ImageTarget = {
  hasImage: (id: string) => boolean
  addImage: (id: string, image: HTMLImageElement, options: { pixelRatio: number }) => void
}

// Rendered at 2× so pins stay crisp on retina screens.
export async function registerPinImages(map: ImageTarget, categories: readonly SpotCategory[]): Promise<void> {
  const jobs = categories.flatMap((cat) =>
    ([false, true] as const).map(async (active) => {
      const id = pinImageId(cat, active)
      if (map.hasImage(id)) return
      const size = active ? PIN_SIZE.active : PIN_SIZE.normal
      const img = await loadSvg(pinSvg(cat, size, active ? PIN_COLOR.active : PIN_COLOR.normal, PIXEL_RATIO))
      if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: PIXEL_RATIO })
    }),
  )
  await Promise.all(jobs)
}
