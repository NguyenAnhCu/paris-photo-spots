// Typed builders for message keys that depend on data values (keeps `t()` calls compile-checked).
import type { WeatherKind } from '@/lib/weather'
import type { BestTime, SpotCategory } from '@/types/spot'
import type { MessageKey } from './messages/vi'

export const categoryLabelKey = (c: SpotCategory): MessageKey => `category.${c}`
export const bestTimeKey = (b: BestTime | null): MessageKey => (b ? `bestTime.${b}` : 'bestTime.unknown')
export const weatherKey = (w: WeatherKind): MessageKey => `weather.${w}`
