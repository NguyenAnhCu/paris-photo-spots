import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import { translateApiError } from './apiError'
import { vi as viMessages, type MessageKey } from './messages/vi'
import { createTranslator } from './translate'

const t = createTranslator('vi')

// Every code the spots/photos endpoints the UI calls can answer with. A code missing here would show the generic
// "could not load data" text for e.g. a rejected photo.
const UI_ERROR_CODES = [
  'VALIDATION_ERROR',
  'SPOT_NOT_FOUND',
  'SPOT_DUPLICATE',
  'OUT_OF_AREA',
  'UNSUPPORTED_IMAGE',
  'FILE_TOO_LARGE',
  'INVALID_IMAGE',
  'IMAGE_TOO_LARGE',
  'UPLOAD_MISSING_FILE',
  'RATE_LIMITED',
]

describe('translateApiError', () => {
  it.each(UI_ERROR_CODES)('has a specific message for %s', (code) => {
    const text = translateApiError(new ApiError('backend text', 400, code), t)
    expect(text).toBe(viMessages[`errors.${code}` as MessageKey])
    expect(text).not.toBe(viMessages['errors.generic'])
  })

  it('falls back to the generic message for unknown codes, missing codes and non-API errors', () => {
    expect(translateApiError(new ApiError('x', 500, 'SOMETHING_NEW'), t)).toBe(viMessages['errors.generic'])
    expect(translateApiError(new ApiError('x', 502), t)).toBe(viMessages['errors.generic'])
    expect(translateApiError(new TypeError('Failed to fetch'), t)).toBe(viMessages['errors.generic'])
  })

  it('never shows the backend message (English, technical) to the user', () => {
    expect(translateApiError(new ApiError('duplicate key value violates…', 409, 'SPOT_DUPLICATE'), t)).not.toContain(
      'duplicate key',
    )
  })
})
