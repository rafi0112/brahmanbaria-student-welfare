import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { api, useApi } from '../lib/api.js'
import { errorKey, useAuth } from '../lib/auth.jsx'
import { Logo } from '../components/Sketch.jsx'
import { supabase, supabaseConfigured } from '../lib/supabase.js'

const emailOk = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())

const MODES = {
  login: { title: 'auth.login', sub: 'auth.loginSub', fields: ['email', 'password'], submit: 'auth.submitLogin' },
  register: { title: 'auth.register', sub: 'auth.registerSub', fields: ['name', 'batch', 'department', 'upazila', 'union', 'email', 'password', 'confirm', 'terms'], submit: 'auth.submitRegister' },
  forgot: { title: 'auth.forgot', sub: 'auth.forgotSub', fields: ['email'], submit: 'auth.sendLink' },
  reset: { title: 'auth.reset', sub: 'auth.resetSub', fields: ['password', 'confirm'], submit: 'auth.setPassword' },
}

function ArtBackdrop() {
  return (
    <>
      <img className="auth-art auth-art-l" src="/art/leaves-bl.webp" alt="" />
      <img className="auth-art auth-art-r" src="/art/vine-tl.webp" alt="" />
    </>
  )
}

export default function Auth({ mode }) {
  const { t, pick, n } = useApp()
  const nav = useNavigate()
  const auth = useAuth()
  const [sp] = useSearchParams()
  const token = sp.get('token') || ''
  const cfg = MODES[mode]
  const depts = useApi(mode === 'register' ? '/departments' : null)
  const ups = useApi(mode === 'register' ? '/upazilas' : null)
  const [v, setV] = useState({ name: '', batch: '', department: '', upazila: '', union: '', email: '', password: '', confirm: '', terms: false, remember: false })
  const [errs, setErrs] = useState({})
  const [notice, setNotice] = useState(null) // { tone: 'ok' | 'bad', key }
  const [busy, setBusy] = useState(false)
  const [needVerify, setNeedVerify] = useState(false)

  const validate = () => {
    const e = {}
    if (cfg.fields.includes('name') && v.name.trim().length < 2) e.name = t('auth.e.name')
    for (const k of ['batch', 'department', 'upazila', 'union']) if (cfg.fields.includes(k) && !v[k]) e[k] = t('auth.e.select')
    if (cfg.fields.includes('email') && !emailOk(v.email)) e.email = t('auth.e.email')
    if (cfg.fields.includes('password') && v.password.length < (mode === 'login' ? 1 : 8)) e.password = t('auth.e.pass')
    if (cfg.fields.includes('confirm') && v.confirm !== v.password) e.confirm = t('auth.e.match')
    if (cfg.fields.includes('terms') && !v.terms) e.terms = t('auth.e.terms')
    return e
  }

  const submit = async (ev) => {
    ev.preventDefault()
    setNotice(null); setNeedVerify(false)
    const e = validate()
    setErrs(e)
    if (Object.keys(e).length) return
    if (mode === 'reset' && !token) { setNotice({ tone: 'bad', key: 'auth.noToken' }); return }
    setBusy(true)
    try {
      const profile = { name: v.name, batch: Number(v.batch), department: v.department, upazila: v.upazila, union: v.union }
      if (mode === 'register' && supabaseConfigured) {
        const { data, error } = await supabase.auth.signUp({ email: v.email, password: v.password, options: { data: profile, emailRedirectTo: `${window.location.origin}/verify-email` } })
        if (error) throw Object.assign(new Error(error.message), { status: 400 })
        if (data.session) await api('/me/profile', { method: 'POST', body: JSON.stringify(profile) })
        nav(`/verify-email?email=${encodeURIComponent(v.email)}`)
      } else if (mode === 'register') {
        await api('/auth/register', { method: 'POST', body: JSON.stringify({ ...profile, email: v.email, password: v.password }) })
        nav(`/verify-email?email=${encodeURIComponent(v.email)}`)
      } else if (mode === 'login') {
        if (supabaseConfigured) {
          const { data, error } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password })
          if (error) throw Object.assign(new Error(error.message), { status: error.message.toLowerCase().includes('confirm') ? 403 : 401, message: error.message })
          auth.set(await api('/auth/me'))
        } else {
          auth.set(await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: v.email, password: v.password }) }))
        }
        nav('/dashboard')
      } else if (mode === 'forgot') {
        if (supabaseConfigured) {
          const { error } = await supabase.auth.resetPasswordForEmail(v.email, { redirectTo: `${window.location.origin}/reset-password` })
          if (error) throw Object.assign(new Error(error.message), { status: 400 })
        } else await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: v.email }) })
        setNotice({ tone: 'ok', key: 'auth.sentIfExists' })
      } else {
        if (supabaseConfigured) {
          const { error } = await supabase.auth.updateUser({ password: v.password })
          if (error) throw Object.assign(new Error(error.message), { status: 400 })
        } else await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password: v.password }) })
        setNotice({ tone: 'ok', key: 'auth.resetDone' })
      }
    } catch (err) {
      if (err.fields) setErrs(err.fields)
      if (err.message === 'email_not_verified' || err.status === 403) { setNeedVerify(true); setNotice({ tone: 'bad', key: 'auth.notVerified' }) }
      else if (err.status === 401) setNotice({ tone: 'bad', key: 'auth.badLogin' })
      else if (err.status === 400 && mode === 'reset') setNotice({ tone: 'bad', key: 'auth.resetFailed' })
      else if (err.status !== 422) setNotice({ tone: 'bad', key: errorKey(err) || 'state.error' })
    } finally {
      setBusy(false)
    }
  }

  const upList = ups.data?.items || []
  const unions = upList.find((u) => u.slug === v.upazila)?.unions || []
  const options = {
    batch: Array.from({ length: 25 }, (_, i) => 25 - i).map((b) => [b, `${t('auth.batch')} ${n(b)}`]),
    department: (depts.data?.items || []).map((d) => [d, d]),
    upazila: upList.map((u) => [u.slug, pick(u.nameBn, u.nameEn)]),
    union: unions.map((x) => [x, x]),
  }
  const setSel = (k) => (e) => setV({ ...v, [k]: e.target.value, ...(k === 'upazila' ? { union: '' } : {}) })
  const bind = (k) => ({ value: v[k], onChange: (e) => setV({ ...v, [k]: e.target.value }), 'aria-invalid': !!errs[k], 'aria-describedby': errs[k] ? `${k}-err` : undefined })
  const label = { batch: 'auth.batch', department: 'auth.dept', upazila: 'auth.upazila', union: 'auth.union', name: 'auth.name', email: 'auth.email', password: 'auth.password', confirm: 'auth.confirm' }

  const resend = async () => {
    try { await api('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: v.email }) }); setNotice({ tone: 'ok', key: 'auth.resent' }) }
    catch (err) { setNotice({ tone: 'bad', key: errorKey(err) || 'state.error' }) }
  }

  return (
    <section className="auth-wrap">
      <ArtBackdrop />
      <div className="auth-card">
        <Logo size={52} />
        <h1>{t(cfg.title)}</h1>
        <p className="muted">{t(cfg.sub)}</p>
        <form onSubmit={submit} noValidate>
          {cfg.fields.filter((f) => f !== 'terms').map((f) => (options[f] ? (
            <label key={f} className="field">
              <span>{t(label[f])}</span>
              <select id={f} value={v[f]} onChange={setSel(f)} aria-invalid={!!errs[f]} disabled={f === 'union' && !v.upazila}>
                <option value="">{t('auth.select')}</option>
                {options[f].map(([val, text]) => <option key={val} value={val}>{text}</option>)}
              </select>
              {errs[f] && <small className="err" id={`${f}-err`}>{errs[f]}</small>}
            </label>
          ) : (
            <label key={f} className="field">
              <span>{t(label[f])}</span>
              <input id={f} type={f === 'email' ? 'email' : f === 'password' || f === 'confirm' ? 'password' : 'text'}
                autoComplete={f === 'email' ? 'email' : f === 'name' ? 'name' : mode === 'login' ? 'current-password' : 'new-password'} {...bind(f)} />
              {errs[f] && <small className="err" id={`${f}-err`}>{errs[f]}</small>}
            </label>
          )))}
          {mode === 'login' && (
            <div className="row between">
              <label className="check"><input type="checkbox" checked={v.remember} onChange={(e) => setV({ ...v, remember: e.target.checked })} />{t('auth.remember')}</label>
              <Link to="/forgot-password">{t('auth.forgot')}</Link>
            </div>
          )}
          {mode === 'register' && (
            <>
              <label className="check"><input type="checkbox" checked={v.terms} onChange={(e) => setV({ ...v, terms: e.target.checked })} />{t('auth.terms')}</label>
              {errs.terms && <small className="err">{errs.terms}</small>}
              <p className="muted small">{t('auth.approval')}</p>
            </>
          )}
          <button className="btn btn-dark btn-block" type="submit" disabled={busy}>{busy ? t('state.loading') : t(cfg.submit)}</button>
          {mode === 'login' && supabaseConfigured && (
            <div className="row">
              <button type="button" className="btn btn-ghost" onClick={async () => {
                const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/verify-email` } })
                if (error) setNotice({ tone: 'bad', key: 'state.error' })
              }}>{t('auth.google')}</button>
              <button type="button" className="btn btn-ghost" onClick={async () => {
                const { error } = await supabase.auth.signInWithOAuth({ provider: 'facebook', options: { redirectTo: `${window.location.origin}/verify-email` } })
                if (error) setNotice({ tone: 'bad', key: 'state.error' })
              }}>{t('auth.facebook')}</button>
            </div>
          )}
          <div aria-live="polite">
            {notice && <p className={`notice ${notice.tone}`} role={notice.tone === 'bad' ? 'alert' : 'status'}>{t(notice.key)}</p>}
            {needVerify && <button type="button" className="btn btn-ghost btn-sm" onClick={resend}>{t('auth.resend')}</button>}
          </div>
        </form>
        <p className="muted center">
          {mode === 'login' && <>{t('auth.noAccount')} <Link to="/register">{t('nav.register')}</Link></>}
          {mode === 'register' && <>{t('auth.haveAccount')} <Link to="/login">{t('nav.login')}</Link></>}
          {(mode === 'forgot' || mode === 'reset') && <Link to="/login">← {t('auth.back')}</Link>}
        </p>
      </div>
    </section>
  )
}

const verifying = new Map()

export function Verify() {
  const { t } = useApp()
  const [sp] = useSearchParams()
  const token = sp.get('token')
  const email = sp.get('email') || ''
  const [state, setState] = useState(token ? 'verifying' : 'wait') // verifying | ok | bad | err | wait
  const [notice, setNotice] = useState(null)
  const [address, setAddress] = useState(email)

  useEffect(() => {
    if (!supabase || token) return undefined
    let live = true
    supabase.auth.getSession().then(({ data }) => {
      if (live && data.session?.user?.email_confirmed_at) setState('ok')
    })
    return () => { live = false }
  }, [token])

  useEffect(() => {
    if (!token) return undefined
    let live = true
    // One request per token: tokens are single-use, so React's dev double-effect must not send it twice.
    verifying.set(token, verifying.get(token) || api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }))
    verifying.get(token)
      .then(() => live && setState('ok'))
      .catch((err) => live && setState(err.status === 400 ? 'bad' : 'err'))
    return () => { live = false }
  }, [token])

  const resend = async () => {
    try { await api('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: address }) }); setNotice({ tone: 'ok', key: 'auth.resent' }) }
    catch (err) { setNotice({ tone: 'bad', key: errorKey(err) || 'state.error' }) }
  }

  return (
    <section className="auth-wrap">
      <ArtBackdrop />
      <div className="auth-card center">
        <Logo size={52} />
        <h1>{t('auth.verify')}</h1>
        {state === 'verifying' && <p className="muted" role="status">{t('auth.verifying')}</p>}
        {state === 'ok' && <><p className="notice ok" role="status">{t('auth.verified')}</p><Link className="btn btn-dark btn-block" to="/login">{t('nav.login')}</Link></>}
        {(state === 'bad' || state === 'err') && <p className="notice bad" role="alert">{state === 'bad' ? t('auth.verifyFailed') : t('state.error')}</p>}
        {(state === 'wait' || state === 'bad') && (
          <>
            {state === 'wait' && <p className="muted">{email ? t('auth.registered') : t('auth.verifyBody')}</p>}
            <label className="field" style={{ textAlign: 'left' }}>
              <span>{t('auth.email')}</span>
              <input type="email" value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
            <button className="btn btn-ghost btn-block" onClick={resend} disabled={!emailOk(address)}>{t('auth.resend')}</button>
            {notice && <p className={`notice ${notice.tone}`} role="status">{t(notice.key)}</p>}
          </>
        )}
        <Link to="/login">← {t('auth.back')}</Link>
      </div>
    </section>
  )
}
