import { ApiError } from '@/api/client'
import { hasMessage, type Translate } from './translate'

// Map backend error codes to localized text; unknown codes fall back to a generic message.
export function translateApiError(error: unknown, t: Translate): string {
  if (error instanceof ApiError && error.code) {
    const key = `errors.${error.code}`
    if (hasMessage(key)) return t(key)
  }
  return t('errors.generic')
}
