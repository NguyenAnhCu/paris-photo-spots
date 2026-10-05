// Current weather from Open-Meteo (free, no key). Called from the browser; cached by TanStack Query (hooks/useWeather).
export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'showers' | 'thunder'
export type Weather = { tempC: number; kind: WeatherKind }

// WMO weather codes, grouped as in the design.
export function weatherKind(code: number): WeatherKind {
  if (code === 0) return 'clear'
  if (code <= 3) return 'cloudy'
  if (code <= 48) return 'fog'
  if (code <= 57) return 'drizzle'
  if (code <= 67) return 'rain'
  if (code <= 77) return 'snow'
  if (code <= 82) return 'showers'
  return 'thunder'
}

export async function fetchWeather(lat: number, lng: number, signal?: AbortSignal): Promise<Weather> {
  const url = new URL(OPEN_METEO_URL)
  url.searchParams.set('latitude', lat.toFixed(4))
  url.searchParams.set('longitude', lng.toFixed(4))
  url.searchParams.set('current', 'temperature_2m,weather_code')
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
  const data = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number } }
  const temp = data.current?.temperature_2m
  const code = data.current?.weather_code
  if (typeof temp !== 'number' || typeof code !== 'number') throw new Error('Open-Meteo: unexpected payload')
  return { tempC: Math.round(temp), kind: weatherKind(code) }
}
