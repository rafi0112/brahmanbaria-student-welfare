import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { api, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { errorKey, useAuth } from '../lib/auth.jsx'
import { Avatar, Badge, Data, Empty, Loading } from '../components/ui.jsx'
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

export function Admin() {
  return <Gate role="admin">{() => <AdminBody />}</Gate>
}

function AdminBody() {
  const { t, n } = useApp()
  const [status, setStatus] = useState('pending')
  const overview = useApi('/admin/overview')
  const list = useApi(`/admin/members?status=${status}`)
  const stats = useApi('/stats')
  const [err, setErr] = useState(null)
  const nav = [['dash', '▦'], ['students', '☺'], ['batches', '#'], ['places', '◬'], ['blog', '✎'], ['gallery', '▣'], ['messages', '✉'], ['users', '⚙']]

  const act = async (id, verb) => {
    setErr(null)
    try {
      await api(`/admin/members/${id}/${verb}`, { method: 'POST' })
      list.retry(); overview.retry()
    } catch (e) { setErr(errorKey(e) || 'admin.failed') }
  }
  const counts = overview.data?.members || {}

  return (
    <div className="admin">
      <aside className="admin-side">
        <Link to="/" className="brand brand-light"><Logo size={34} /><span><b>{t('brand')}</b></span></Link>
        <nav aria-label="Admin">
          {nav.map(([k, ic], i) => <NavLink key={k} to="/admin" className={i === 0 ? 'on' : ''} end><span aria-hidden="true">{ic}</span>{t(`admin.nav.${k}`)}</NavLink>)}
        </nav>
      </aside>
      <div className="admin-main">
        <h1>{t('admin.title')}</h1>
        <h2>{t('admin.overview')}</h2>
        <dl className="admin-stats">
          {['pending', 'approved', 'rejected'].map((s) => <div key={s}><dt>{t(`admin.${s}`)}</dt><dd className="num">{n(counts[s] ?? 0)}</dd></div>)}
          <div><dt>{t('stat.students')}</dt><dd className="num">{stats.data ? n(stats.data.students) : '–'}</dd></div>
        </dl>

        <h2>{t('admin.members')}</h2>
        <div className="chips" role="group">
          {['pending', 'approved', 'rejected'].map((s) => <button key={s} className={`chip ${status === s ? 'on' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>{t(`admin.${s}`)}</button>)}
        </div>
        {err && <p className="notice bad" role="alert">{t(err)}</p>}
        <Data q={list}>
          {(d) => d.items.length === 0 ? <Empty>{status === 'pending' ? t('admin.noPending') : t('state.empty')}</Empty> : (
            <table className="table">
              <tbody>
                {d.items.map((m) => (
                  <tr key={m.userId}>
                    <td><Avatar name={m.name} size={34} /> <strong>{m.name}</strong><br /><small className="muted">{m.email}{!m.emailVerified && ` · ${t('admin.unverified')}`}</small></td>
                    <td>{t('students.batch')} {n(m.batch)}<br /><small className="muted">{m.department}</small></td>
                    <td><small className="muted">{m.union}, {m.upazila}</small></td>
                    <td className="actions">
                      {m.status !== 'approved' && <button className="btn btn-dark btn-sm" onClick={() => act(m.userId, 'approve')}>{t('admin.approve')}</button>}
                      {m.status !== 'rejected' && <button className="btn btn-ghost btn-sm" onClick={() => act(m.userId, 'reject')}>{t('admin.reject')}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Data>
        <Data q={stats}>
          {(s) => (
            <>
              <h2>Blood group counts <small className="muted">(aggregate only)</small></h2>
              <div className="bars">
                {Object.entries(s.blood).sort((a, b) => b[1] - a[1]).map(([g, c]) => (
                  <div key={g} className="bar"><span>{g}</span><i style={{ width: `${(c / Math.max(...Object.values(s.blood))) * 100}%` }} /><b className="num">{n(c)}</b></div>
                ))}
              </div>
            </>
          )}
        </Data>
      </div>
    </div>
  )
}
