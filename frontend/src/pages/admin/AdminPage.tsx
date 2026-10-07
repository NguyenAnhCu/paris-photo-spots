import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, type AdminUser, type Role } from '@/api/admin'
import { Modal } from '@/components/account/Modal'
import { reasonKey } from '@/components/moderation/reasons'
import { PillButton } from '@/components/ui'
import { useMe } from '@/hooks/useMe'
import { translateApiError } from '@/i18n/apiError'
import { useI18n } from '@/i18n/useI18n'
import type { MessageKey } from '@/i18n/messages/vi'
import '@/components/moderation/moderation.css'
import '@/pages/StandalonePage.css'
import './admin.css'

type Tab = 'users' | 'log' | 'config'
const TABS: Tab[] = ['users', 'log', 'config']
const ROLES: Role[] = ['participant', 'reviewer', 'admin']
const DAY_MS = 24 * 60 * 60 * 1000

function UsersTab() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<Role | ''>('')
  const [deleting, setDeleting] = useState<AdminUser | null>(null)
  const users = useQuery({
    queryKey: ['admin', 'users', search, role],
    queryFn: () => adminApi.users({ search: search.trim() || undefined, role: role || undefined }),
  })
  const act = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso))

  return (
    <>
      <div className="admin__filters">
        <label className="field">
          <span className="field__label">{t('admin.search')}</span>
          <input className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('admin.role')}</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
            <option value="">{t('filter.all')}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {act.isError && (
        <p className="modal__error" role="alert">
          {translateApiError(act.error, t)}
        </p>
      )}
      <ul className="admin__users">
        {(users.data?.items ?? []).map((u) => {
          const suspended = u.postingSuspendedUntil && new Date(u.postingSuspendedUntil) > new Date()
          return (
            <li key={u.id} className="admin__user" aria-label={u.name}>
              <div className="admin__who">
                <b>{u.name}</b>
                {u.isAnonymous && <span className="status-chip">{t('account.anonymous')}</span>}
                {u.username && <span className="admin__email">@{u.username}</span>}
                {u.email && <span className="admin__email">{u.email}</span>}
                <span className="admin__counts">{t('admin.counts', { spots: u.spots, photos: u.photos })}</span>
                {suspended && u.postingSuspendedUntil && (
                  <span className="status-chip status-chip--rejected">
                    {t('admin.suspendedUntil', { date: date(u.postingSuspendedUntil) })}
                  </span>
                )}
              </div>
              <div className="admin__actions">
                <label>
                  <span className="visually-hidden">{t('admin.roleOf', { name: u.name })}</span>
                  <select
                    className="input"
                    value={u.role}
                    disabled={act.isPending}
                    onChange={(e) => {
                      // Read now: React puts the controlled value back before the mutation runs.
                      const next = e.target.value as Role
                      act.mutate(() => adminApi.setRole(u.id, next))
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r} disabled={r !== 'participant' && u.isAnonymous}>
                        {t(`role.${r}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </label>
                {u.role !== 'admin' &&
                  (suspended ? (
                    <PillButton
                      variant="tonal"
                      disabled={act.isPending}
                      onClick={() => act.mutate(() => adminApi.suspend(u.id, null))}
                    >
                      {t('admin.lift')}
                    </PillButton>
                  ) : (
                    <PillButton
                      variant="tonal"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate(() => adminApi.suspend(u.id, new Date(Date.now() + 30 * DAY_MS).toISOString()))
                      }
                    >
                      {t('admin.suspend30')}
                    </PillButton>
                  ))}
                <PillButton variant="clay" disabled={act.isPending} onClick={() => setDeleting(u)}>
                  {t('admin.delete')}
                </PillButton>
              </div>
            </li>
          )
        })}
      </ul>
      {deleting && (
        <Modal title={t('admin.deleteTitle', { name: deleting.name })} onClose={() => setDeleting(null)}>
          <p className="modal__warn">{t('admin.deleteWarning')}</p>
          <div className="modal__actions">
            <PillButton variant="tonal" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </PillButton>
            <PillButton
              variant="clay"
              onClick={() => {
                const id = deleting.id
                setDeleting(null)
                act.mutate(() => adminApi.remove(id))
              }}
            >
              {t('admin.deleteConfirm')}
            </PillButton>
          </div>
        </Modal>
      )}
    </>
  )
}

function LogTab() {
  const { t, locale } = useI18n()
  const log = useQuery({ queryKey: ['admin', 'log'], queryFn: () => adminApi.log() })
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
  return (
    <ul className="admin__log">
      {(log.data?.items ?? []).map((e) => (
        <li key={e.id}>
          <span className="mono">{time(e.createdAt)}</span> <b>{e.actorName}</b> ·{' '}
          {t(`admin.action.${e.action}` as MessageKey)} · {e.targetName ?? '—'}
          {e.reasonCode && <> · {t(reasonKey(e.reasonCode))}</>}
        </li>
      ))}
    </ul>
  )
}

function ConfigTab() {
  const { t } = useI18n()
  const config = useQuery({ queryKey: ['admin', 'config'], queryFn: () => adminApi.config() })
  return (
    <>
      <p>{t('admin.configInfo')}</p>
      <dl className="admin__config">
        {Object.entries(config.data ?? {}).map(([k, v]) => (
          <div key={k}>
            <dt className="mono">{k}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

// Admins only (lazy chunk). The backend enforces manage_users / system; this page only hides itself.
export default function AdminPage() {
  const { t } = useI18n()
  const me = useMe()
  const [tab, setTab] = useState<Tab>('users')
  if (me.isPending) return <main className="standalone">{t('common.loading')}</main>
  if (me.data?.user?.role !== 'admin') {
    return (
      <main className="standalone">
        <h1>{t('admin.title')}</h1>
        <p>{t('admin.adminOnly')}</p>
        <Link to="/staff/sign-in">{t('staff.title')}</Link>
      </main>
    )
  }
  return (
    <main className="standalone admin">
      <Link to="/">{t('terms.back')}</Link>
      <h1>{t('admin.title')}</h1>
      <div className="review__tabs" role="tablist" aria-label={t('admin.title')}>
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className="review__tab"
            onClick={() => setTab(k)}
          >
            {t(`admin.tab.${k}` as MessageKey)}
          </button>
        ))}
      </div>
      <section className="admin__panel" role="tabpanel" aria-label={t(`admin.tab.${tab}` as MessageKey)}>
        {tab === 'users' ? <UsersTab /> : tab === 'log' ? <LogTab /> : <ConfigTab />}
      </section>
    </main>
  )
}
