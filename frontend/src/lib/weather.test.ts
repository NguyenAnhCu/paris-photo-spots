import { describe, expect, it, vi } from 'vitest'
import { fetchWeather, OPEN_METEO_URL, weatherKind } from './weather'

describe('weatherKind (WMO codes)', () => {
  it.each([
    [0, 'clear'],
    [1, 'cloudy'],
    [3, 'cloudy'],
    [45, 'fog'],
    [48, 'fog'],
    [51, 'drizzle'],
    [57, 'drizzle'],
    [61, 'rain'],
    [67, 'rain'],
    [71, 'snow'],
    [77, 'snow'],
    [80, 'showers'],
    [82, 'showers'],
    [95, 'thunder'],
    [99, 'thunder'],
  ])('%i → %s', (code, kind) => {
    expect(weatherKind(code)).toBe(kind)
  })
})

describe('fetchWeather', () => {
  it('asks Open-Meteo for current temperature + code at 4 decimals and rounds the temperature', async () => {
    const fetchMock = vi.fn(async () => Response.json({ current: { temperature_2m: 17.6, weather_code: 61 } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchWeather(48.858372, 2.294481)).resolves.toEqual({ tempC: 18, kind: 'rain' })
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]))
    expect(`${url.origin}${url.pathname}`).toBe(OPEN_METEO_URL)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '48.8584',
      longitude: '2.2945',
      current: 'temperature_2m,weather_code',
    })
  })

  it('throws on HTTP errors and on unexpected payloads (the UI shows "—" instead of wrong data)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('busy', { status: 503 })),
    )
    await expect(fetchWeather(48.85, 2.35)).rejects.toThrow('503')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ current: { temperature_2m: 'warm' } })),
    )
    await expect(fetchWeather(48.85, 2.35)).rejects.toThrow('unexpected payload')
  })
})
