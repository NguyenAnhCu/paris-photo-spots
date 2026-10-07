import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, type MeResponse } from '@/api/auth'
import { useI18n } from '@/i18n/useI18n'
import { captchaToken } from '@/lib/turnstile'

export const meKey = ['me'] as const

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: ({ signal }) => authApi.me(signal), staleTime: 5 * 60_000 })
}

// Before the first post: create the anonymous identity if there is none, and record the accepted terms.
// Returns once the browser may post.
export function useEnsurePoster() {
  const queryClient = useQueryClient()
  const { locale } = useI18n()
  return async (): Promise<MeResponse> => {
    let me = await queryClient.fetchQuery({ queryKey: meKey, queryFn: () => authApi.me() })
    if (!me.user) {
      await authApi.signInAnonymous(locale, await captchaToken())
      me = await authApi.me()
    }
    if (me.user && !me.user.termsAccepted) me = await authApi.acceptTerms(me.termsVersion)
    queryClient.setQueryData(meKey, me)
    return me
  }
}

function useSetMe() {
  const queryClient = useQueryClient()
  return (me: MeResponse) => queryClient.setQueryData(meKey, me)
}

export function useRename() {
  const setMe = useSetMe()
  return useMutation({ mutationFn: (name: string) => authApi.rename(name), onSuccess: setMe })
}

export function useRecoverySignIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => authApi.signInWithRecoveryCode(code, await captchaToken()),
    // Another person now: everything cached for the previous identity goes.
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => authApi.signOut(),
    onSuccess: () => {
      queryClient.setQueryData(meKey, (old: MeResponse | undefined) => ({
        termsVersion: old?.termsVersion ?? '',
        user: null,
      }))
      queryClient.invalidateQueries()
    },
  })
}
