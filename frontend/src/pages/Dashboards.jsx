import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, qs, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { errorKey, useAuth } from '../lib/auth.jsx'
import { Avatar, Badge, Data, Empty, Loading, Pagination } from '../components/ui.jsx'

const LEVELS = ['public', 'members', 'hidden']
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

export function Gate({ role, children }) {
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
    if (!/^\d{4}-\d{2}$/.test((v.session || '').trim())) bad.session = t('auth.sessionHint')
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
      <label className="field"><span>{t('auth.session')}</span>
        <input value={v.session || ''} placeholder="2020-21" onChange={(e) => setV({ ...v, session: e.target.value })} aria-invalid={!!errs.session} />
        {errs.session && <small className="err">{errs.session}</small>}
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
