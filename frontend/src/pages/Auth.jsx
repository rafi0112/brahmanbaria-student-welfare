import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { api, useApi } from '../lib/api.js'
import { errorKey, useAuth } from '../lib/auth.jsx'
import { toApiError } from '../lib/authErrors.js'
import { LeafMark } from '../components/Decor.jsx'
import { PasswordInput } from '../components/ui.jsx'
import AuthShell from '../components/AuthShell.jsx'
import { googleEnabled, supabase, supabaseConfigured, urlAuthError } from '../lib/supabase.js'

const emailOk = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())
const origin = () => window.location.origin

const MODES = {
  login: { title: 'auth.login', sub: 'auth.loginSub', fields: ['email', 'password'], submit: 'auth.submitLogin' },
  register: { title: 'auth.register', sub: 'auth.registerSub', fields: ['name', 'batch', 'department', 'session', 'upazila', 'union', 'gender', 'bloodGroup', 'phone', 'email', 'photoLink', 'password', 'confirm', 'terms'], submit: 'auth.submitRegister' },
  forgot: { title: 'auth.forgot', sub: 'auth.forgotSub', fields: ['email'], submit: 'auth.sendLink' },
  reset: { title: 'auth.reset', sub: 'auth.resetSub', fields: ['password', 'confirm'], submit: 'auth.setPassword' },
}

// Asks Supabase to send the signup confirmation email again (the legacy API handles the non-Supabase mode).
async function resendConfirmation(email) {
  if (supabaseConfigured) {
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${origin()}/verify-email` } })
    if (error) throw toApiError(error)
  } else {
    await api('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) })
  }
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
  const [v, setV] = useState({ name: '', phone: '', photoLink: '', batch: '', department: '', session: '', gender: '', bloodGroup: '', upazila: '', union: '', email: '', password: '', confirm: '', terms: false, remember: false })
  const [errs, setErrs] = useState({})
  const [notice, setNotice] = useState(null) // { tone: 'ok' | 'bad', key }
  const [busy, setBusy] = useState(false)
  const [needVerify, setNeedVerify] = useState(false)
  const [done, setDone] = useState(false)
  // Password reset with Supabase needs the recovery session that the emailed link creates.
  const [recovery, setRecovery] = useState(mode === 'reset' && supabaseConfigured ? (urlAuthError ? 'expired' : 'checking') : 'ready')

  // someone who is already signed in has no use for the login page
  useEffect(() => { if (mode === 'login' && auth.user) nav('/', { replace: true }) }, [mode, auth.user, nav])

  useEffect(() => {
    if (mode !== 'reset' || !supabaseConfigured || urlAuthError) return undefined
    let live = true
    const { data: sub } = supabase.auth.onAuthStateChange((event) => { if (live && event === 'PASSWORD_RECOVERY') setRecovery('ready') })
    supabase.auth.getSession().then(({ data }) => { if (live) setRecovery(data.session ? 'ready' : 'missing') })
    return () => { live = false; sub.subscription.unsubscribe() }
  }, [mode])

  const validate = () => {
    const e = {}
    if (cfg.fields.includes('name') && v.name.trim().length < 2) e.name = t('auth.e.name')
    for (const k of ['batch', 'department', 'upazila', 'union']) if (cfg.fields.includes(k) && !v[k]) e[k] = t('auth.e.select')
    if (cfg.fields.includes('session') && !/^\d{4}-\d{2}$/.test(v.session.trim())) e.session = t('auth.sessionHint')
    if (cfg.fields.includes('phone') && !/^01\d{9}$/.test(v.phone.trim())) e.phone = t('auth.e.phone')
    if (cfg.fields.includes('email') && !emailOk(v.email)) e.email = t('auth.e.email')
    if (cfg.fields.includes('password') && v.password.length < (mode === 'login' ? 1 : 8)) e.password = t('auth.e.pass')
    if (cfg.fields.includes('confirm') && v.confirm !== v.password) e.confirm = t('auth.e.match')
    if (cfg.fields.includes('photoLink') && v.photoLink.trim() && !/^https:\/\/\S+$/.test(v.photoLink.trim())) e.photoLink = t('photo.e.link')
    if (cfg.fields.includes('terms') && !v.terms) e.terms = t('auth.e.terms')
    return e
  }

  const submit = async (ev) => {
    ev.preventDefault()
    setNotice(null); setNeedVerify(false)
    const e = validate()
    setErrs(e)
    if (Object.keys(e).length) return
    if (mode === 'reset' && !supabaseConfigured && !token) { setNotice({ tone: 'bad', key: 'auth.noToken' }); return }
    setBusy(true)
    try {
      const profile = { name: v.name.trim(), batch: Number(v.batch), department: v.department, session: v.session.trim(), upazila: v.upazila, union: v.union, gender: v.gender, bloodGroup: v.bloodGroup, phone: v.phone.trim(), photoLink: v.photoLink.trim() }
      const email = v.email.trim()
      if (mode === 'register' && supabaseConfigured) {
        // The member details travel as user metadata; the profile is created at first sign-in (see AuthProvider).
        const { data, error } = await supabase.auth.signUp({ email, password: v.password, options: { data: profile, emailRedirectTo: `${origin()}/verify-email` } })
        if (error) throw toApiError(error)
        // For an address that already has an account Supabase answers with a look-alike user that has no identities and
        // sends no email. One email, one account: say so instead of waiting for a message that will never come.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) { setErrs({ email: t('auth.e.exists') }); setNotice({ tone: 'bad', key: 'auth.e.existsNote' }); return }
        nav(`/verify-email?email=${encodeURIComponent(email)}`)
      } else if (mode === 'register') {
        await api('/auth/register', { method: 'POST', body: JSON.stringify({ ...profile, email, password: v.password }) })
        nav(`/verify-email?email=${encodeURIComponent(email)}`)
      } else if (mode === 'login') {
        if (supabaseConfigured) {
          const { error } = await supabase.auth.signInWithPassword({ email, password: v.password })
          if (error) throw toApiError(error)
          await auth.refresh()
        } else {
          auth.set(await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: v.password }) }))
        }
        nav('/', { replace: true })
      } else if (mode === 'forgot') {
        if (supabaseConfigured) {
          // Unknown addresses get the same answer, so the form cannot be used to find registered emails.
          const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin()}/reset-password` })
          if (error) throw toApiError(error)
        } else await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
        setNotice({ tone: 'ok', key: 'auth.sentIfExists' })
      } else {
        if (supabaseConfigured) {
          const { error } = await supabase.auth.updateUser({ password: v.password })
          if (error) throw toApiError(error)
          await supabase.auth.signOut() // finish on the login page with the new password
        } else await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password: v.password }) })
        setDone(true)
        setNotice({ tone: 'ok', key: 'auth.resetDone' })
      }
    } catch (err) {
      if (err.fields) setErrs(err.fields)
      if (err.code === 'user_already_exists' || err.code === 'email_exists') { setErrs({ email: t('auth.e.exists') }); setNotice({ tone: 'bad', key: 'auth.e.existsNote' }) }
      else if (err.code === 'weak_password') setErrs({ password: t('auth.e.pass') })
      else if (err.message === 'email_not_verified' || err.status === 403) { setNeedVerify(true); setNotice({ tone: 'bad', key: 'auth.notVerified' }) }
      else if (err.status === 401) setNotice({ tone: 'bad', key: 'auth.badLogin' })
      else if (err.status === 429) setNotice({ tone: 'bad', key: 'auth.rateLimited' })
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
    gender: [['female', t('ad.mem.female')], ['male', t('ad.mem.male')], ['other', t('ad.mem.other')]],
    bloodGroup: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => [b, b]),
  }
  const optional = { gender: true, bloodGroup: true }
  const setSel = (k) => (e) => setV({ ...v, [k]: e.target.value, ...(k === 'upazila' ? { union: '' } : {}) })
  const bind = (k) => ({ value: v[k], onChange: (e) => setV({ ...v, [k]: e.target.value }), 'aria-invalid': !!errs[k], 'aria-describedby': errs[k] ? `${k}-err` : undefined })
  const label = { session: 'auth.session', gender: 'auth.gender', bloodGroup: 'auth.blood', batch: 'auth.batch', department: 'auth.dept', upazila: 'auth.upazila', union: 'auth.union', name: 'auth.name', phone: 'auth.phone', photoLink: 'photo.linkLabel', email: 'auth.email', password: 'auth.password', confirm: 'auth.confirm' }

  const resend = async () => {
    try { await resendConfirmation(v.email); setNotice({ tone: 'ok', key: 'auth.resent' }) }
    catch (err) { setNotice({ tone: 'bad', key: err.status === 429 ? 'auth.rateLimited' : (errorKey(err) || 'state.error') }) }
  }

  const blocked = mode === 'reset' && recovery !== 'ready' && !done
  const showForm = !done && !blocked

  return (
    <AuthShell variant={mode === 'register' ? 'register' : mode === 'login' ? 'login' : 'plain'} wide={mode === 'register'}>
      <div className="auth-card">
        <LeafMark size={46} />
        <h1>{t(cfg.title)}</h1>
        <p className="muted">{t(cfg.sub)}</p>
        {blocked && (
          <div aria-live="polite">
            {recovery === 'checking'
              ? <p className="muted" role="status">{t('auth.verifying')}</p>
              : <><p className="notice bad" role="alert">{t(recovery === 'expired' ? 'auth.resetFailed' : 'auth.recoveryMissing')}</p><Link className="btn btn-ghost btn-block" to="/forgot-password">{t('auth.forgot')}</Link></>}
          </div>
        )}
        {done && <p className="notice ok" role="status">{t(notice?.key || 'auth.resetDone')}</p>}
        {done && <Link className="btn btn-dark btn-block" to="/login">{t('nav.login')}</Link>}
        {showForm && (
          <form onSubmit={submit} noValidate>
            <div className={mode === 'register' ? 'form-grid' : undefined}>
            {cfg.fields.filter((f) => f !== 'terms').map((f) => (options[f] ? (
              <label key={f} className="field">
                <span>{t(label[f])}</span>
                <select id={f} value={v[f]} onChange={setSel(f)} aria-invalid={!!errs[f]} disabled={f === 'union' && !v.upazila}>
                  <option value="">{t(optional[f] ? 'auth.genderNone' : 'auth.select')}</option>
                  {options[f].map(([val, text]) => <option key={val} value={val}>{text}</option>)}
                </select>
                {errs[f] && <small className="err" id={`${f}-err`}>{errs[f]}</small>}
              </label>
            ) : (
              <label key={f} className={`field${f === 'name' || f === 'photoLink' ? ' span-2' : ''}`}>
                <span>{t(label[f])}</span>
                {(() => {
                  const props = { id: f, autoComplete: f === 'email' ? 'email' : f === 'name' ? 'name' : f === 'phone' ? 'tel' : f === 'photoLink' ? 'off' : mode === 'login' ? 'current-password' : 'new-password', ...bind(f) }
                  return f === 'password' || f === 'confirm' ? <PasswordInput {...props} /> : <input type={f === 'email' ? 'email' : f === 'phone' ? 'tel' : f === 'photoLink' ? 'url' : 'text'} inputMode={f === 'phone' ? 'numeric' : f === 'photoLink' ? 'url' : undefined} maxLength={f === 'phone' ? 11 : undefined} placeholder={f === 'session' ? '2020-21' : f === 'phone' ? '01XXXXXXXXX' : f === 'photoLink' ? 'https://drive.google.com/…' : undefined} {...props} />
                })()}
                {f === 'photoLink' && !errs[f] && <small className="muted">{t('photo.linkHint')}</small>}
                {errs[f] && <small className="err" id={`${f}-err`}>{errs[f]}</small>}
              </label>
            )))}
            </div>
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
            <button className="btn btn-dark btn-block auth-submit" type="submit" disabled={busy} aria-busy={busy || undefined}>{t(cfg.submit)}</button>
            {mode === 'login' && googleEnabled && (
              <button type="button" className="btn btn-ghost btn-block" onClick={async () => {
                const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin()}/dashboard` } })
                if (error) setNotice({ tone: 'bad', key: 'state.error' })
              }}>{t('auth.google')}</button>
            )}
            <div aria-live="polite">
              {notice && <p className={`notice ${notice.tone}`} role={notice.tone === 'bad' ? 'alert' : 'status'}>{t(notice.key)}</p>}
              {needVerify && <button type="button" className="btn btn-ghost btn-sm" onClick={resend}>{t('auth.resend')}</button>}
            </div>
          </form>
        )}
        <p className="muted center">
          {mode === 'login' && <>{t('auth.noAccount')} <Link to="/register">{t('nav.register')}</Link></>}
          {mode === 'register' && <>{t('auth.haveAccount')} <Link to="/login">{t('nav.login')}</Link></>}
          {(mode === 'forgot' || mode === 'reset') && <Link to="/login">← {t('auth.back')}</Link>}
        </p>
      </div>
    </AuthShell>
  )
}

const verifying = new Map()

// Landing page of the confirmation email (Supabase redirects here with the session in the URL fragment).
export function Verify() {
  const { t } = useApp()
  const [sp] = useSearchParams()
  const token = sp.get('token') // only used by the built-in (non-Supabase) accounts
  const email = sp.get('email') || ''
  // checking | ok | bad | err | wait
  const [state, setState] = useState(supabaseConfigured ? (urlAuthError ? 'bad' : 'checking') : (token ? 'checking' : 'wait'))
  const [notice, setNotice] = useState(null)
  const [address, setAddress] = useState(email)

  useEffect(() => {
    if (!supabaseConfigured || urlAuthError) return undefined
    let live = true
    const confirmed = (session) => Boolean(session?.user?.email_confirmed_at)
    supabase.auth.getSession().then(({ data }) => { if (live) setState(confirmed(data.session) ? 'ok' : 'wait') })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => { if (live && confirmed(session)) setState('ok') })
    return () => { live = false; sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (supabaseConfigured || !token) return undefined
    let live = true
    // One request per token: tokens are single-use, so React's dev double-effect must not send it twice.
    verifying.set(token, verifying.get(token) || api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }))
    verifying.get(token)
      .then(() => live && setState('ok'))
      .catch((err) => live && setState(err.status === 400 ? 'bad' : 'err'))
    return () => { live = false }
  }, [token])

  const resend = async () => {
    try { await resendConfirmation(address); setNotice({ tone: 'ok', key: 'auth.resent' }) }
    catch (err) { setNotice({ tone: 'bad', key: err.status === 429 ? 'auth.rateLimited' : (errorKey(err) || 'state.error') }) }
  }

  return (
    <AuthShell>
      <div className="auth-card center">
        <LeafMark size={46} />
        <h1>{t('auth.verify')}</h1>
        {state === 'checking' && <p className="muted" role="status">{t('auth.verifying')}</p>}
        {state === 'ok' && (
          <>
            <p className="notice ok" role="status">{t('auth.verified')}</p>
            <Link className="btn btn-dark btn-block" to={supabaseConfigured ? '/dashboard' : '/login'}>{t(supabaseConfigured ? 'auth.goDashboard' : 'nav.login')}</Link>
          </>
        )}
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
    </AuthShell>
  )
}
