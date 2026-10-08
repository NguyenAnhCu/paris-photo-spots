import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { IconButton } from '@/components/ui'
import './account.css'

// Small dialog: focus moves in on open and back to the opener on close; Escape and the backdrop close it.
// The Escape listener is in the capture phase and stops there, so panels underneath do not close too.
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n()
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>('input, button:not(.modal__close), a[href]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      opener?.focus()
    }
  }, [onClose])

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="modal__box" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal__head">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon={X} label={t('common.close')} onClick={onClose} className="modal__close" />
        </div>
        {children}
      </div>
    </div>
  )
}
