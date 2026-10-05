import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { photosApi, type PhotoUpload } from '@/api/photos'
import { spotsApi, type NewSpot } from '@/api/spots'
import { config } from '@/config'
import { useI18n } from '@/i18n/useI18n'
import { fetchWeather } from '@/lib/weather'
import type { SpotCollection } from '@/types/spot'

export const spotKeys = {
  all: (lang: string) => ['spots', lang] as const,
  item: (id: string, lang: string) => ['spot', id, lang] as const,
  photos: (id: string) => ['photos', id] as const,
}

// All spots at once (≈ 260): filtering/searching happens client-side (hooks/useSpotFilters).
export function useSpots() {
  const { locale } = useI18n()
  return useQuery({
    queryKey: spotKeys.all(locale),
    queryFn: ({ signal }) => spotsApi.list(locale, signal),
    placeholderData: keepPreviousData, // language switch keeps the old list visible instead of flashing empty
    staleTime: 60_000,
  })
}

export function useSpot(id: string | undefined) {
  const { locale } = useI18n()
  return useQuery({
    queryKey: spotKeys.item(id ?? '', locale),
    queryFn: ({ signal }) => spotsApi.item(id ?? '', locale, signal),
    enabled: Boolean(id),
  })
}

export function useSpotPhotos(spotId: string | undefined) {
  return useInfiniteQuery({
    queryKey: spotKeys.photos(spotId ?? ''),
    queryFn: ({ pageParam, signal }) => photosApi.list(spotId ?? '', pageParam, config.photosPageSize, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.items.length : undefined),
    enabled: Boolean(spotId),
  })
}

export function useWeather(lat: number | undefined, lng: number | undefined) {
  return useQuery({
    queryKey: ['weather', lat?.toFixed(3), lng?.toFixed(3)],
    queryFn: ({ signal }) => fetchWeather(lat ?? 0, lng ?? 0, signal),
    enabled: lat !== undefined && lng !== undefined,
    staleTime: config.weatherStaleMs,
    retry: 1,
  })
}

export function useCreateSpot() {
  const { locale } = useI18n()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (spot: NewSpot) => spotsApi.create(spot, locale),
    onSuccess: (created) => {
      // Prepend to the cached list (no refetch flash, frontend rules) and seed the detail cache.
      queryClient.setQueryData<SpotCollection>(spotKeys.all(locale), (old) =>
        old
          ? {
              ...old,
              features: [
                {
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [created.lng, created.lat] },
                  properties: {
                    id: created.id,
                    name: created.name,
                    photoCategory: created.photoCategory,
                    crowdLevel: created.crowdLevel,
                    bestTime: created.bestTime,
                    coverThumbUrl: null,
                    photoCount: created.photoCount,
                  },
                },
                ...old.features,
              ],
            }
          : old,
      )
      queryClient.setQueryData(spotKeys.item(created.id, locale), created)
      queryClient.invalidateQueries({ queryKey: ['spots'], refetchType: 'none' })
    },
  })
}

export function useUploadPhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (upload: PhotoUpload) => photosApi.upload(upload),
    onSuccess: (photo) => {
      queryClient.invalidateQueries({ queryKey: spotKeys.photos(photo.spotId) })
      queryClient.invalidateQueries({ queryKey: ['spot', photo.spotId] })
      queryClient.invalidateQueries({ queryKey: ['spots'] })
    },
  })
}

export function useSpotById(id: string | undefined) {
  const { data } = useSpots()
  return useMemo(() => data?.features.find((f) => f.properties.id === id), [data, id])
}
