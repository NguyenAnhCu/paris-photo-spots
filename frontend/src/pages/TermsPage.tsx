import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import type { MessageKey } from '@/i18n/messages/vi'
import { PillButton } from '@/components/ui'
import './TermsPage.css'

const PARAGRAPHS: MessageKey[] = ['terms.p1', 'terms.p2', 'terms.p3', 'terms.p4', 'terms.p5']

// Draft terms (P1). The legal phase (P7) replaces them with reviewed texts and bumps TERMS_VERSION.
export function TermsPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  return (
    <main className="terms">
      <PillButton variant="tonal" icon={ArrowLeft} onClick={() => navigate('/')}>
        {t('terms.back')}
      </PillButton>
      <h1>{t('terms.title')}</h1>
      <p className="terms__draft">{t('terms.draft')}</p>
      {PARAGRAPHS.map((key) => (
        <p key={key}>{t(key)}</p>
      ))}
    </main>
  )
}
