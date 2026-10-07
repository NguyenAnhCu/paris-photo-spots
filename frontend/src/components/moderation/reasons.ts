import type { ReasonCode } from '@/api/moderation'
import type { MessageKey } from '@/i18n/messages/vi'

export const reasonKey = (r: ReasonCode): MessageKey => `reason.${r}` as MessageKey
