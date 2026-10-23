import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, qs, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { Avatar, Data } from '../components/ui.jsx'
import { Confirm, EmptyState, Modal, Notice, PageHeader, Pager, RowMenu, SkeletonRows, StatusBadge, useErrText, useFilters, useNotice, useWhen } from './kit.jsx'
import Icon from './icons.jsx'
import ListToolbar from './toolbar.jsx'
import DataTable from './DataTable.jsx'

// Admin management: the people who can administer the site, and nothing else. Ordinary members live under Students.
// The buttons only call the API; the Go backend decides (admins only, approved and verified members only, never the last admin).
export default function RolesAdmin() {
  const { t, lang } = useApp()
  const { user: me } = useAuth()
  const errText = useErrText()
  const go = useNavigate()
  const when = useWhen(lang)
  const [f, set] = useFilters({ q: '', verified: '', account: '', sort: 'newest', page: '1', limit: '20' })
  const list = useApi(`/admin/users${qs({ ...f, role: 'admin', page: f.page === '1' ? '' : f.page })}`)
  const hist = useApi('/admin/role-history?limit=100')
  const { notice, ok, bad, clear } = useNotice()
  const [demote, setDemote] = useState(null)
  const [promote, setPromote] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [only, setOnly] = useState('') // email whose history is shown
  const rows = list.data?.items || []
  const filtered = !!(f.q || f.verified || f.account)
  // the one remaining active administrator cannot leave or be removed (the server enforces this too)
  const soleAdmin = !filtered && rows.length === list.data?.total && rows.filter((x) => !x.disabled && x.emailVerified).length <= 1

  // when and by whom each current administrator was last promoted (from the real role history)
  const promoted = useMemo(() => {
    const m = {}
    for (const r of hist.data?.items || []) if (r.to === 'admin' && !m[r.target]) m[r.target] = r
    return m
  }, [hist.data])

  const explain = (e) => {
    if (e.message === 'target_unverified') return t('admin.err.unverified')
    if (e.message === 'target_unapproved') return t('ad.pm.errUnapproved')
    if (e.message === 'target_disabled') return t('ad.roles.deactivatedNo')
    if (e.message === 'last_admin') return t('admin.err.lastAdmin')
    return errText(e)
  }
  const apply = async () => {
    setBusy(true); clear()
    try {
      await api(`/admin/users/${demote.id}/role`, { method: 'POST', body: JSON.stringify({ role: 'member' }) })
      ok(t('admin.roles.done'))
      list.retry(); hist.retry()
    } catch (e) { bad(explain(e)) } finally { setBusy(false); setDemote(null) }
  }
  const label = (r) => r.name || r.email
  const shownHistory = (hist.data?.items || []).filter((r) => !only || r.target === only)

  return (
    <section aria-labelledby="roles-h">
      <PageHeader title={<span id="roles-h">{t('admin.roles.title')}</span>} desc={t('ad.pm.lede')}
        action={<button type="button" className="btn btn-dark" onClick={() => setPromote(true)}><Icon name="plus" size={16} /> {t('ad.pm.button')}</button>} />
      <ListToolbar section="roles" values={f} set={set} defaults={{ sort: 'newest', limit: '20' }} total={list.data?.total} loading={list.loading}
        search={{ placeholder: t('admin.roles.search') }}
        fields={[
          { key: 'verified', label: t('ad.stu.verified'), all: t('ad.stu.anyVerified'), advanced: true, options: [['yes', t('ad.stu.verifiedYes')], ['no', t('ad.stu.verifiedNo')]] },
          { key: 'account', label: t('ad.stu.account'), all: t('ad.stu.anyAccount'), advanced: true, options: [['active', t('ad.stu.active')], ['deactivated', t('ad.stu.deactivated')]] },
        ]}
        sorts={[['newest', t('ad.stu.sort.newest')], ['oldest', t('ad.stu.sort.oldest')], ['name', t('ad.stu.sort.name')], ['email', t('ad.roles.sort.email')]]} />
      <p className="muted small">{t('admin.roles.note')}</p>
      <Notice notice={notice} onClose={clear} />

      {list.loading && <SkeletonRows />}
      {list.error && <Data q={list}>{() => null}</Data>}
      {list.data && (rows.length === 0 ? <EmptyState title={t(filtered ? 'ad.stu.noMatch' : 'ad.pm.none')} text={filtered ? t('ad.stu.noMatchHint') : undefined} /> : (
        <>
          <DataTable caption={t('admin.roles.title')} rows={rows} rowKey={(x) => x.id} rowClass={(x) => (x.disabled ? 'is-off' : '')}
            columns={[
              { id: 'member', label: t('ad.pm.admin'), primary: true, cell: (x) => (
                <span className="dt-person"><Avatar name={label(x)} size={34} />
                  <span className="dt-twoline"><strong className="dt-clamp">{x.name || x.email}{x.id === me?.id && <span className="st st-you">{t('admin.roles.you')}</span>}</strong>{x.name && <small className="dt-sub dt-trunc" title={x.email}>{x.email}</small>}</span></span>
              ) },
              { id: 'role', label: t('ad.pm.role'), width: '110px', cell: () => <span className="st st-role">{t('admin.roles.admin')}</span> },
              { id: 'account', label: t('ad.stu.col.account'), width: '24%', cell: (x) => (
                <div className="dt-stack">
                  <small className={`dt-sub ${x.emailVerified ? '' : 'is-warn'}`}>{x.emailVerified ? t('admin.roles.verified') : t('admin.roles.unverified')}</small>
                  <small className="dt-sub">{x.disabled ? t('ad.stu.deactivated') : t('ad.stu.active')}</small>
                </div>
              ) },
              { id: 'since', label: t('ad.pm.since'), width: '22%', cell: (x) => {
                const p = promoted[x.email]
                return p ? <div className="dt-stack"><small className="dt-sub">{when(p.at)}</small><small className="dt-sub dt-trunc">{p.actor || (p.source === 'bootstrap' ? t('admin.roles.bootstrap') : '—')}</small></div> : <small className="dt-sub">{t('ad.pm.sinceUnknown')}</small>
              } },
              { id: 'actions', srLabel: t('ad.actions'), width: '60px', className: 'dt-actions-cell', cell: (x) => (
                <div className="dt-actions">
                  <RowMenu label={`${t('ad.actions')}: ${label(x)}`} items={[
                    { label: t('ad.pm.viewProfile'), icon: 'users', onClick: () => go(`/admin/students?q=${encodeURIComponent(x.email)}`) },
                    { label: t('ad.pm.viewHistory'), icon: 'clock', onClick: () => { setOnly(x.email); setShowHistory(true) } },
                    { label: t(x.id === me?.id ? 'admin.roles.leave' : 'admin.roles.makeMember'), icon: 'down', danger: true, sep: true, onClick: () => { if (soleAdmin && !x.disabled && x.emailVerified) bad(t('admin.err.lastAdmin')); else setDemote(x) } },
                  ]} />
                </div>
              ) },
            ]} />
          <Pager total={list.data.total} page={list.data.page} pages={list.data.pages} limit={f.limit} onPage={(p) => set({ page: p })} onLimit={(limit) => set({ limit })} />
        </>
      ))}

      <div className="ad-role-history">
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={showHistory} onClick={() => { setShowHistory(!showHistory); setOnly('') }}>{showHistory ? '▾' : '▸'} {t('admin.roles.history')}{only ? ` · ${only}` : ''}</button>
        {showHistory && (
          <Data q={hist}>
            {() => shownHistory.length === 0 ? <p className="muted">{t('admin.roles.historyNone')}</p> : (
              <ul className="ad-list">
                {shownHistory.map((r, i) => (
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

      {demote && (
        <Confirm title={t('ad.roles.demoteTitle')} busy={busy}
          text={t(demote.id === me?.id ? 'admin.roles.confirmLeave' : 'admin.roles.confirmDemote').replace('{who}', `${label(demote)} (${demote.email})`)}
          label={t(demote.id === me?.id ? 'admin.roles.leave' : 'admin.roles.makeMember')} tone="danger" onYes={apply} onNo={() => setDemote(null)} />
      )}
      {promote && <PromoteDialog onClose={() => setPromote(false)} onDone={() => { setPromote(false); ok(t('ad.pm.done')); list.retry(); hist.retry() }} explain={explain} />}
    </section>
  )
}

// Why a registered account cannot be promoted, or '' when it can. The backend repeats every one of these checks.
function ineligible(u, t) {
  if (u.role === 'admin') return t('ad.pm.alreadyAdmin')
  if (u.disabled) return t('ad.roles.deactivatedNo')
  if (u.memberStatus !== 'approved') return t('ad.pm.errUnapproved')
  if (!u.emailVerified) return t('admin.err.unverified')
  return ''
}

// Promote a member: search real accounts, check eligibility, confirm, then let the backend make the change.
function PromoteDialog({ onClose, onDone, explain }) {
  const { t } = useApp()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [picked, setPicked] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { const id = setTimeout(() => setTerm(q.trim()), 250); return () => clearTimeout(id) }, [q])
  const res = useApi(picked || term.length < 2 ? null : `/admin/users${qs({ q: term, limit: 8, sort: 'name' })}`)
  const items = res.data?.items || []

  const go = async () => {
    setBusy(true); setErr('')
    try { await api(`/admin/users/${picked.id}/role`, { method: 'POST', body: JSON.stringify({ role: 'admin' }) }); onDone() } catch (e) { setErr(explain(e)) } finally { setBusy(false) }
  }
  if (picked) {
    return (
      <Confirm title={t('ad.pm.confirmTitle')} busy={busy} label={t('admin.roles.makeAdmin')} onYes={go} onNo={() => { setPicked(null); setErr('') }}
        text={t('ad.pm.confirmText').replace('{who}', picked.name || picked.email)}
        detail={(
          <>
            <p className="ad-role-change"><Avatar name={picked.name || picked.email} size={30} /> <strong>{picked.name || picked.email}</strong> <span className="muted">{picked.email}</span></p>
            <p className="muted small"><StatusBadge status={picked.memberStatus} /> · {t('admin.roles.verified')}</p>
            {err && <p className="notice bad" role="alert">{err}</p>}
          </>
        )} />
    )
  }
  return (
    <Modal title={t('ad.pm.button')} onClose={onClose}>
      <p className="muted small">{t('ad.pm.rule')}</p>
      <label className="field compact"><span>{t('ad.pm.search')}</span>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.roles.search')} /></label>
      <div aria-live="polite" className="pm-results">
        {term.length < 2 && <p className="muted small">{t('ad.pm.type')}</p>}
        {res.loading && term.length >= 2 && <p className="muted small">{t('state.loading')}</p>}
        {res.error && <p className="notice bad" role="alert">{t('ad.e.generic')}</p>}
        {res.data && items.length === 0 && <p className="muted small">{t('ad.pm.noResults')}</p>}
        {items.length > 0 && (
          <ul className="pm-list">
            {items.map((u) => {
              const why = ineligible(u, t)
              return (
                <li key={u.id}>
                  <button type="button" className="pm-row" disabled={!!why} onClick={() => setPicked(u)}>
                    <Avatar name={u.name || u.email} size={32} />
                    <span className="pm-id"><strong>{u.name || u.email}</strong><small className="muted">{u.email}</small></span>
                    <span className="pm-state">{u.memberStatus ? <StatusBadge status={u.memberStatus} /> : <small className="muted">{t('ad.pm.noProfile')}</small>}
                      <small className={u.emailVerified ? 'muted' : 'is-warn'}>{u.emailVerified ? t('admin.roles.verified') : t('admin.roles.unverified')}</small></span>
                    {why && <small className="pm-why">{why}</small>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <p className="muted small">{t('ad.pm.importedNote')} <Link to="/admin/students?tab=imported">{t('ad.nav.imported')}</Link></p>
    </Modal>
  )
}
