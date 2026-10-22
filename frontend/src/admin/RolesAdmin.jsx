import { useState } from 'react'
import { api, qs, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { Avatar, Badge, Data } from '../components/ui.jsx'
import { Confirm, EmptyState, Notice, PageHeader, Pager, SkeletonRows, useErrText, useFilters, useNotice, useWhen } from './kit.jsx'
import ListToolbar from './toolbar.jsx'
import DataTable from './DataTable.jsx'

// Admin management: who is an admin, who can become one, and every change that was made.
// The buttons only call the API; the Go backend decides (admins only, verified accounts only, never the last admin).
export default function RolesAdmin() {
  const { t, lang } = useApp()
  const { user: me } = useAuth()
  const errText = useErrText()
  const when = useWhen(lang)
  const [f, set] = useFilters({ q: '', role: '', verified: '', account: '', sort: 'newest', page: '1', limit: '20' })
  const list = useApi(`/admin/users${qs({ ...f, page: f.page === '1' ? '' : f.page })}`)
  const { notice, ok, bad, clear } = useNotice()
  const [pending, setPending] = useState(null) // { row, role }
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState(false)
  const hist = useApi(history ? '/admin/role-history?limit=30' : null)
  const rows = list.data?.items || []
  const filtered = !!(f.q || f.role || f.verified || f.account)

  const explain = (e) => {
    if (e.message === 'target_unverified') return t('admin.err.unverified')
    if (e.message === 'last_admin') return t('admin.err.lastAdmin')
    return errText(e)
  }
  const apply = async () => {
    setBusy(true); clear()
    try {
      await api(`/admin/users/${pending.row.id}/role`, { method: 'POST', body: JSON.stringify({ role: pending.role }) })
      ok(t('admin.roles.done'))
      list.retry(); hist.retry()
    } catch (e) { bad(explain(e)) } finally { setBusy(false); setPending(null) }
  }
  const label = (r) => r.name || r.email
  const confirmText = () => {
    const who = `${label(pending.row)} (${pending.row.email})`
    const key = pending.role === 'admin' ? 'admin.roles.confirmPromote' : pending.row.id === me?.id ? 'admin.roles.confirmLeave' : 'admin.roles.confirmDemote'
    return t(key).replace('{who}', who)
  }

  return (
    <section aria-labelledby="roles-h">
      <PageHeader title={<span id="roles-h">{t('admin.roles.title')}</span>} desc={t('admin.roles.lede')} />
      <ListToolbar section="roles" values={f} set={set} defaults={{ sort: 'newest', limit: '20' }} total={list.data?.total} loading={list.loading}
        search={{ placeholder: t('admin.roles.search') }}
        views={[
          { id: 'all', label: t('ad.roles.view.all'), patch: { role: '' } }, { id: 'admin', label: t('admin.roles.admin'), patch: { role: 'admin' } },
          { id: 'member', label: t('admin.roles.member'), patch: { role: 'member' } },
        ]}
        fields={[
          { key: 'verified', label: t('ad.stu.verified'), all: t('ad.stu.anyVerified'), advanced: true, options: [['yes', t('ad.stu.verifiedYes')], ['no', t('ad.stu.verifiedNo')]] },
          { key: 'account', label: t('ad.stu.account'), all: t('ad.stu.anyAccount'), advanced: true, options: [['active', t('ad.stu.active')], ['deactivated', t('ad.stu.deactivated')]] },
        ]}
        sorts={[['newest', t('ad.stu.sort.newest')], ['oldest', t('ad.stu.sort.oldest')], ['name', t('ad.stu.sort.name')], ['email', t('ad.roles.sort.email')], ['role', t('ad.roles.sort.role')]]} />
      <p className="muted small">{t('admin.roles.note')}</p>
      <Notice notice={notice} onClose={clear} />

      {list.loading && <SkeletonRows />}
      {list.error && <Data q={list}>{() => null}</Data>}
      {list.data && (rows.length === 0 ? <EmptyState title={t(filtered ? 'ad.stu.noMatch' : 'admin.roles.none')} text={filtered ? t('ad.stu.noMatchHint') : undefined} /> : (
        <>
          <DataTable caption={t('admin.roles.title')} rows={rows} rowKey={(x) => x.id} rowClass={(x) => (x.disabled ? 'is-off' : '')}
            columns={[
              { id: 'member', label: t('ad.stu.col.member'), primary: true, cell: (x) => (
                <span className="dt-person"><Avatar name={label(x)} size={34} />
                  <span className="dt-twoline"><strong className="dt-clamp">{x.name || x.email}{x.id === me?.id && <span className="st st-you">{t('admin.roles.you')}</span>}</strong>{x.name && <small className="dt-sub dt-trunc" title={x.email}>{x.email}</small>}</span></span>
              ) },
              { id: 'role', label: t('admin.roles.title'), width: '120px', cell: (x) => <span className={`st ${x.role === 'admin' ? 'st-role' : 'st-neutral'}`}>{t(x.role === 'admin' ? 'admin.roles.admin' : 'admin.roles.member')}</span> },
              { id: 'account', label: t('ad.stu.col.account'), width: '30%', cell: (x) => (
                <div className="dt-stack">
                  <small className={`dt-sub ${x.emailVerified ? '' : 'is-warn'}`}>{x.emailVerified ? t('admin.roles.verified') : t('admin.roles.unverified')}</small>
                  <small className="dt-sub">{x.disabled ? t('ad.stu.deactivated') : t('ad.stu.active')} · {when(x.createdAt)}</small>
                </div>
              ) },
              { id: 'actions', srLabel: t('ad.actions'), width: '170px', className: 'dt-actions-cell', cell: (x) => (
                <div className="dt-actions">
                  {x.role === 'admin'
                    ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPending({ row: x, role: 'member' })}>{t(x.id === me?.id ? 'admin.roles.leave' : 'admin.roles.makeMember')}</button>
                    : <button type="button" className="btn btn-outline btn-sm" disabled={!x.emailVerified || x.disabled} title={!x.emailVerified ? t('admin.err.unverified') : x.disabled ? t('ad.roles.deactivatedNo') : undefined}
                      onClick={() => setPending({ row: x, role: 'admin' })}>{t('admin.roles.makeAdmin')}</button>}
                </div>
              ) },
            ]} />
          <Pager total={list.data.total} page={list.data.page} pages={list.data.pages} limit={f.limit} onPage={(p) => set({ page: p })} onLimit={(limit) => set({ limit })} />
        </>
      ))}

      <div className="ad-role-history">
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={history} onClick={() => setHistory(!history)}>{history ? '▾' : '▸'} {t('admin.roles.history')}</button>
        {history && (
          <Data q={hist}>
            {(d) => d.items.length === 0 ? <p className="muted">{t('admin.roles.historyNone')}</p> : (
              <ul className="ad-list">
                {d.items.map((r, i) => (
                  <li key={i}>
                    <span><strong>{r.target}</strong>: {t(`admin.roles.${r.from}`)} → {t(`admin.roles.${r.to}`)}</span>
                    <span className="muted small">{r.actor || (r.source === 'bootstrap' ? t('admin.roles.bootstrap') : '—')} · {when(r.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Data>
        )}
      </div>

      {pending && (
        <Confirm title={t(pending.role === 'admin' ? 'ad.roles.promoteTitle' : 'ad.roles.demoteTitle')} text={confirmText()} busy={busy}
          detail={<p className="ad-role-change"><Avatar name={label(pending.row)} size={30} /> <strong>{label(pending.row)}</strong> · <Badge tone="muted">{t(`admin.roles.${pending.row.role}`)}</Badge> → <Badge tone="gold">{t(`admin.roles.${pending.role}`)}</Badge></p>}
          label={t(pending.role === 'admin' ? 'admin.roles.makeAdmin' : pending.row.id === me?.id ? 'admin.roles.leave' : 'admin.roles.makeMember')}
          tone={pending.role === 'member' ? 'danger' : undefined} onYes={apply} onNo={() => setPending(null)} />
      )}
    </section>
  )
}
