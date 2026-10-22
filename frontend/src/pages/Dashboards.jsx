import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { BaseProvider } from '../lib/base.js'
import { api, qs, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { errorKey, useAuth } from '../lib/auth.jsx'
import { Avatar, Badge, Data, Empty, Loading, Pagination } from '../components/ui.jsx'
import CommitteeManager from './CommitteeAdmin.jsx'
import AdminDashboard from '../admin/Dashboard.jsx'
import RolesAdmin from '../admin/RolesAdmin.jsx'
import CommandPalette from '../admin/CommandPalette.jsx'
import Icon from '../admin/icons.jsx'
import { Logo } from '../components/Sketch.jsx'

const LEVELS = ['public', 'members', 'hidden']
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

function Gate({ role, children }) {
  const { t } = useApp()
  const { user, loading } = useAuth()
  if (loading) return <section className="section wrap narrow"><Loading /></section>
  if (!user) return <section className="section wrap narrow center"><p className="lede">{t('auth.needLogin')}</p><Link className="btn btn-dark" to="/login">{t('nav.login')}</Link></section>
  if (role && user.role !== role) return <section className="section wrap narrow center"><p className="lede">{t('auth.noAccess')}</p></section>
  return children(user)
}

function statusBadge(t, s) {
  if (s === 'approved') return <Badge tone="leaf">{t('dash.statusApproved')}</Badge>
  if (s === 'rejected') return <Badge tone="muted">{t('dash.statusRejected')}</Badge>
  return <Badge tone="gold">{t('dash.pending')}</Badge>
}

export function Dashboard() {
  return <Gate>{(user) => <DashboardBody user={user} />}</Gate>
}

function CompleteProfile({ defaultName, onDone }) {
  const { t, n, pick } = useApp()
  const depts = useApi('/departments')
  const ups = useApi('/upazilas')
  const [v, setV] = useState({ name: defaultName, batch: '', department: '', upazila: '', union: '' })
  const [errs, setErrs] = useState({})
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const upList = ups.data?.items || []
  const unions = upList.find((u) => u.slug === v.upazila)?.unions || []
  const opt = {
    batch: Array.from({ length: 25 }, (_, i) => 25 - i).map((b) => [b, `${t('auth.batch')} ${n(b)}`]),
    department: (depts.data?.items || []).map((d) => [d, d]),
    upazila: upList.map((u) => [u.slug, pick(u.nameBn, u.nameEn)]),
    union: unions.map((x) => [x, x]),
  }
  const lbl = { batch: 'auth.batch', department: 'auth.dept', upazila: 'auth.upazila', union: 'auth.union' }
  const submit = async (e) => {
    e.preventDefault()
    const bad = {}
    if (v.name.trim().length < 2) bad.name = t('auth.e.name')
    for (const k of ['batch', 'department', 'upazila', 'union']) if (!v[k]) bad[k] = t('auth.e.select')
    setErrs(bad); setMsg(null)
    if (Object.keys(bad).length) return
    setBusy(true)
    try { onDone(await api('/me/profile', { method: 'POST', body: JSON.stringify({ ...v, batch: Number(v.batch) }) })) }
    catch (err) { if (err.fields) setErrs(err.fields); else setMsg(errorKey(err) || 'admin.failed') }
    finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="card-form" noValidate>
      <h2>{t('dash.complete')}</h2>
      <p className="muted">{t('dash.completeNote')}</p>
      <label className="field"><span>{t('auth.name')}</span>
        <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-invalid={!!errs.name} />
        {errs.name && <small className="err">{errs.name}</small>}
      </label>
      {Object.keys(opt).map((k) => (
        <label key={k} className="field"><span>{t(lbl[k])}</span>
          <select value={v[k]} disabled={k === 'union' && !v.upazila} aria-invalid={!!errs[k]}
            onChange={(e) => setV({ ...v, [k]: e.target.value, ...(k === 'upazila' ? { union: '' } : {}) })}>
            <option value="">{t('auth.select')}</option>
            {opt[k].map(([val, text]) => <option key={val} value={val}>{text}</option>)}
          </select>
          {errs[k] && <small className="err">{errs[k]}</small>}
        </label>
      ))}
      <button className="btn btn-dark" disabled={busy}>{busy ? t('state.loading') : t('auth.submitRegister')}</button>
      {msg && <p className="notice bad" role="alert">{t(msg)}</p>}
    </form>
  )
}

function DashboardBody({ user }) {
  const { t, n, pick } = useApp()
  const auth = useAuth()
  const p = auth.profile
  const ups = useApi('/upazilas')
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState(null)
  const [errs, setErrs] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (p) setForm({ phone: p.phone || '', bloodGroup: p.bloodGroup || '', showInDirectory: p.showInDirectory, showPhone: p.showPhone, showEmail: p.showEmail, showBlood: p.showBlood })
  }, [p])

  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null); setErrs({})
    try {
      auth.set(await api('/me/profile', { method: 'PATCH', body: JSON.stringify(form) }))
      setMsg({ tone: 'ok', key: 'dash.saved' })
    } catch (err) {
      if (err.fields) setErrs(err.fields)
      else setMsg({ tone: 'bad', key: errorKey(err) || 'admin.failed' })
    } finally { setBusy(false) }
  }

  const up = (ups.data?.items || []).find((u) => u.slug === p?.upazila)
  const lvl = (k, label) => (
    <label className="field">
      <span>{t(label)}</span>
      <select value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}>
        {LEVELS.map((l) => <option key={l} value={l}>{t(l === 'public' ? 'dash.public' : l === 'members' ? 'dash.members' : 'dash.off')}</option>)}
      </select>
      {errs[k] && <small className="err">{errs[k]}</small>}
    </label>
  )

  return (
    <section className="section wrap narrow">
      <header className="dash-head">
        <Avatar name={p?.name || user.email} size={72} />
        <div>
          <h1>{t('dash.hello')}, {p?.name || user.email}</h1>
          <p className="muted">{user.email}</p>
          {p && <p className="muted">{t('dash.status')}: {statusBadge(t, p.status)}</p>}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={auth.logout}>{t('auth.logout')}</button>
      </header>
      {!p ? (
        user.role === 'admin'
          ? <Empty>{t('dash.noProfile')} <Link to="/admin">{t('admin.title')} →</Link></Empty>
          : <CompleteProfile defaultName={user.email.split('@')[0]} onDone={auth.set} />
      ) : (
        <>
          {p.status === 'pending' && <p className="notice">{t('dash.pendingNote')}</p>}
          <h2>{t('dash.details')}</h2>
          <dl className="facts">
            <div><dt>{t('students.batch')}</dt><dd>{n(p.batch)}</dd></div>
            <div><dt>{t('students.dept')}</dt><dd>{p.department}</dd></div>
            <div><dt>{t('auth.upazila')}</dt><dd>{up ? pick(up.nameBn, up.nameEn) : p.upazila}</dd></div>
            <div><dt>{t('auth.union')}</dt><dd>{p.union}</dd></div>
          </dl>
          {form && (
            <form onSubmit={save} className="card-form" noValidate>
              <h2>{t('dash.contact')}</h2>
              <label className="field">
                <span>{t('dash.phone')}</span>
                <input inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01XXXXXXXXX" aria-invalid={!!errs.phone} />
                {errs.phone && <small className="err">{errs.phone}</small>}
              </label>
              <label className="field">
                <span>{t('dash.bloodGroup')}</span>
                <select value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
                  <option value="">{t('dash.notSet')}</option>
                  {BLOOD.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                {errs.bloodGroup && <small className="err">{errs.bloodGroup}</small>}
              </label>
              <h2>{t('dash.visibility')}</h2>
              <label className="check" style={{ marginBottom: 14 }}>
                <input type="checkbox" checked={form.showInDirectory} onChange={(e) => setForm({ ...form, showInDirectory: e.target.checked })} />{t('dash.listed')}
              </label>
              {lvl('showPhone', 'dash.show.phone')}
              {lvl('showEmail', 'dash.show.email')}
              {lvl('showBlood', 'dash.show.blood')}
              <button className="btn btn-dark" disabled={busy}>{busy ? t('state.loading') : t('dash.save')}</button>
              <div aria-live="polite">{msg && <p className={`notice ${msg.tone}`}>{t(msg.key)}</p>}</div>
            </form>
          )}
        </>
      )}
    </section>
  )
}

// The admin panel is a frame (sidebar + top bar) around its sections, so the sidebar stays on screen
// whichever section or page is open.
export function AdminShell() {
  return <Gate role="admin">{() => <AdminFrame />}</Gate>
}

function AdminFrame() {
  const { t } = useApp()
  const { user: me, profile, logout } = useAuth()
  const go = useNavigate()
  const loc = useLocation()
  const [params] = useSearchParams()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [loc.pathname, loc.search])
  const onHome = loc.pathname === '/admin'
  const tab = ['roles', 'committee'].includes(params.get('tab')) ? params.get('tab') : 'dash'
  const sections = [['dash', 'dashboard', 'admin.nav.dash'], ['roles', 'shield', 'admin.tab.roles'], ['committee', 'star', 'admin.tab.committee']]
  const pages = [['/admin/students', 'users', 'admin.nav.students'], ['/admin/heritage', 'landmark', 'admin.nav.places'], ['/admin/blog', 'pen', 'admin.nav.blog'], ['/admin/gallery', 'image', 'admin.nav.gallery'], ['/admin/activity', 'clock', 'ad.nav.activity']]
  const [palette, setPalette] = useState(false)
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p) } }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  const here = (p) => loc.pathname === p || loc.pathname.startsWith(`${p}/`)
  const name = profile?.name || me?.email?.split('@')[0] || ''
  return (
    <div className="admin">
      <aside className={`admin-side ${open ? 'open' : ''}`}>
        <div className="admin-side-top">
          <Link to="/" className="brand brand-light"><Logo size={34} /><span><b>{t('brand')}</b></span></Link>
          <button type="button" className="admin-burger" aria-expanded={open} aria-controls="admin-nav" onClick={() => setOpen(!open)}>
            <span aria-hidden="true">{open ? '✕' : '☰'}</span> {t(open ? 'nav.close' : 'nav.menu')}
          </button>
        </div>
        <nav id="admin-nav" aria-label="Admin" className="admin-nav">
          {sections.map(([k, ic, label]) => {
            const on = onHome && tab === k
            return <Link key={k} to={k === 'dash' ? '/admin' : `/admin?tab=${k}`} title={t(label)} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}><Icon name={ic} /><span className="nav-label">{t(label)}</span></Link>
          })}
          {pages.map(([to, ic, label]) => <Link key={to} to={to} title={t(label)} className={here(to) ? 'on' : ''} aria-current={here(to) ? 'page' : undefined}><Icon name={ic} /><span className="nav-label">{t(label)}</span></Link>)}
          <small className="side-label">{t('admin.nav.site')}</small>
          <a href="/" target="_blank" rel="noopener noreferrer"><Icon name="external" /><span className="nav-label">{t('admin.nav.exit')}</span></a>
        </nav>
      </aside>
      <div className="admin-main">
        <div className="admin-top">
          <div className="admin-title"><h1>{t('admin.title')}</h1>
            <button type="button" className="ad-cmdk" onClick={() => setPalette(true)} aria-label={t('ad.cmd.open')}><Icon name="search" size={16} /><span>{t('ad.cmd.placeholder')}</span><kbd>Ctrl K</kbd></button></div>
          <div className="admin-who">
            <Avatar name={name || '?'} size={34} />
            <span className="admin-id"><strong>{name}</strong><small className="muted">{me?.email} · {t('admin.roles.admin')}</small></span>
            <button className="btn btn-ghost btn-sm" onClick={async () => { await logout(); go('/') }}>{t('auth.logout')}</button>
          </div>
        </div>
        <BaseProvider value="/admin"><Outlet /></BaseProvider>
        {palette && <CommandPalette onClose={() => setPalette(false)} />}
      </div>
    </div>
  )
}

// /admin shows the dashboard; ?tab=roles and ?tab=committee open the two management sections.
export function AdminHome() {
  const [params] = useSearchParams()
  const tab = params.get('tab')
  if (tab === 'roles') return <RolesAdmin />
  if (tab === 'committee') return <CommitteeManager />
  return <AdminDashboard />
}
