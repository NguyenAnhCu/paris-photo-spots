import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { categoryLabelKey } from '@/i18n/keys'
import type { SpotCategory } from '@/types/spot'
import { ALL_CATEGORIES_ICON, CATEGORY_ICON } from './categoryIcons'
import './ui.css'

type PillVariant = 'primary' | 'tonal' | 'clay' | 'dark' | 'white'

type PillButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: PillVariant
  icon?: LucideIcon
  size?: 'md' | 'lg'
  block?: boolean
}

export function PillButton({
  variant = 'tonal',
  icon: Icon,
  size = 'md',
  block,
  className,
  children,
  ...rest
}: PillButtonProps) {
  const classes = ['pill', `pill--${variant}`, size === 'lg' && 'pill--lg', block && 'pill--block', className]
  return (
    <button type="button" className={classes.filter(Boolean).join(' ')} {...rest}>
      {Icon && <Icon size={size === 'lg' ? 20 : 18} strokeWidth={2} aria-hidden="true" />}
      {children}
    </button>
  )
}

// Icon-only button: an accessible name is mandatory.
type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & { icon: LucideIcon; label: string }

export function IconButton({ icon: Icon, label, className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={['icon-btn', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon size={18} strokeWidth={2} aria-hidden="true" />
    </button>
  )
}

type CategoryChipProps = { category: SpotCategory | 'all'; selected: boolean; onSelect: () => void }

export function CategoryChip({ category, selected, onSelect }: CategoryChipProps) {
  const { t } = useI18n()
  const Icon = category === 'all' ? ALL_CATEGORIES_ICON : CATEGORY_ICON[category]
  return (
    <button type="button" className="chip" aria-pressed={selected} onClick={onSelect}>
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
      {category === 'all' ? t('filter.all') : t(categoryLabelKey(category))}
    </button>
  )
}

type TagTone = 'tonal' | 'neutral' | 'paper' | 'mono' | 'crowd-1' | 'crowd-2' | 'crowd-3'

export function Tag({
  tone = 'tonal',
  children,
  className,
}: {
  tone?: TagTone
  children: ReactNode
  className?: string
}) {
  return (
    <span className={['tag', tone !== 'tonal' && `tag--${tone}`, className].filter(Boolean).join(' ')}>{children}</span>
  )
}

type StatTileProps = { icon: LucideIcon; label: ReactNode; value: ReactNode; stacked?: boolean }

export function StatTile({ icon: Icon, label, value, stacked }: StatTileProps) {
  return (
    <div className={stacked ? 'stat stat--stacked' : 'stat'}>
      <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
      <div className="stat__text">
        <span className="stat__label">{label}</span>
        <span className="stat__value">{value}</span>
      </div>
    </div>
  )
}

export function GlassPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={['glass', className].filter(Boolean).join(' ')}>{children}</div>
}

// Cover / community photo in its original colours, striped placeholder when missing.
type PhotoProps = { src: string | null; alt: string; className?: string; loading?: 'lazy' | 'eager' }

export function Photo({ src, alt, className, loading = 'lazy' }: PhotoProps) {
  return (
    <div className={['photo-frame', className].filter(Boolean).join(' ')}>
      {src && <img src={src} alt={alt} loading={loading} decoding="async" />}
    </div>
  )
}
