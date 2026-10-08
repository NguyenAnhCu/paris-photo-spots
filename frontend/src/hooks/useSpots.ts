import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { submissionsApi, type MySpot } from '@/api/moderation'
import { photosApi, type PhotoUpload } from '@/api/photos'
import { spotsApi, type NewSpot } from '@/api/spots'
import { config } from '@/config'
import { useI18n } from '@/i18n/useI18n'
import { fetchWeather } from '@/lib/weather'
import type { SpotCollection } from '@/types/spot'
import { useMe } from './useMe'

export const spotKeys = {
  all: (lang: string) => ['spots', lang] as const,
  item: (id: string, lang: string) => ['spot', id, lang] as const,
  photos: (id: string) => ['photos', id] as const,
  mine: ['me', 'submissions'] as const,
}

// The signed-in participant's own posts with their review status.
export function useSubmissions() {
  const signedIn = Boolean(useMe().data?.user)
  return useQuery({
    queryKey: spotKeys.mine,
    queryFn: ({ signal }) => submissionsApi.mine(signal),
    enabled: signedIn,
    staleTime: 30_000,
  })
}

const pendingFeature = (s: MySpot): SpotCollection['features'][number] => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
  properties: {
    id: s.id,
    name: s.name,
    photoCategory: s.photoCategory,
    crowdLevel: 2,
    bestTime: null,
    coverThumbUrl: null,
    photoCount: 0,
    pending: true,
  },
})

// All spots at once (≈ 260): filtering/searching happens client-side (hooks/useSpotFilters). The public list never
// contains pending spots; the viewer's own ones are added here (first, marked pending) so authors see what they posted.
export function useSpots() {
  const { locale } = useI18n()
  const query = useQuery({
    queryKey: spotKeys.all(locale),
    queryFn: ({ signal }) => spotsApi.list(locale, signal),
    placeholderData: keepPreviousData, // language switch keeps the old list visible instead of flashing empty
    staleTime: 60_000,
  })
  const mine = useSubmissions().data?.spots
  const data = useMemo((): SpotCollection | undefined => {
    const pending = (mine ?? []).filter((s) => s.status === 'pending')
    if (!query.data || pending.length === 0) return query.data
    return { ...query.data, features: [...pending.map(pendingFeature), ...query.data.features] }
  }, [query.data, mine])
  return { ...query, data }
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
      queryClient.setQueryData(spotKeys.item(created.id, locale), created)
      // Waiting for review: it shows through the author's submissions, not the public list.
      if (created.status !== 'approved') {
        queryClient.invalidateQueries({ queryKey: spotKeys.mine })
        return
      }
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
      queryClient.invalidateQueries({ queryKey: spotKeys.mine })
    },
  })
}

export function useSpotById(id: string | undefined) {
  const { data } = useSpots()
  return useMemo(() => data?.features.find((f) => f.properties.id === id), [data, id])
}
