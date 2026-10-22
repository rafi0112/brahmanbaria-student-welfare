import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { errorKey, useAuth } from '../lib/auth.jsx'
import { readUrlAuthError } from '../lib/authErrors.js'
import { supabase, supabaseConfigured } from '../lib/supabase.js'
import { Logo } from '../components/Sketch.jsx'
import { PasswordInput } from '../components/ui.jsx'
import AuthShell from '../components/AuthShell.jsx'

// Captured once, before the Supabase client removes the error from the address bar.
const urlAuthError = typeof window === 'undefined' ? null : readUrlAuthError(window.location.search, window.location.hash)

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

// Landing page of the invitation email. Supabase has already validated the single-use link and confirmed the email address by the
// time a session exists here. Steps: (1) set your own password, (2) review the profile that was already on file, (3) submit it.
// The invitation link carries no profile details; the profile is fetched only after sign-in, for the confirmed address.
export default function Activate() {
  const { t, n, pick } = useApp()
  const auth = useAuth()
  const [step, setStep] = useState(supabaseConfigured ? (urlAuthError ? 'invalid' : 'checking') : 'unavailable')
  const [pw, setPw] = useState({ password: '', confirm: '' })
  const [pwErr, setPwErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [invite, setInvite] = useState(null)
  const [v, setV] = useState(null)
  const [errs, setErrs] = useState({})
  const [msg, setMsg] = useState('')
  const depts = useApi(step === 'profile' ? '/departments' : null)
  const ups = useApi(step === 'profile' ? '/upazilas' : null)

  useEffect(() => {
    if (!supabaseConfigured || urlAuthError) return undefined
    let live = true
    const confirmed = (session) => Boolean(session?.user?.email_confirmed_at)
    const ready = (session) => { if (live && confirmed(session)) setStep((s) => (s === 'checking' || s === 'invalid' ? 'password' : s)) }
    supabase.auth.getSession().then(({ data }) => ready(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => ready(session))
    // no session shortly after arriving: the link was already used, has expired, or this is not an invitation link
    const timer = setTimeout(() => live && setStep((s) => (s === 'checking' ? 'invalid' : s)), 4000)
    return () => { live = false; clearTimeout(timer); sub.subscription.unsubscribe() }
  }, [])

  const loadProfile = async () => {
    await auth.refresh()
    const d = await api('/me/invitation')
    if (d.invited) {
      setInvite(d)
      setV({ name: d.profile.name || '', batch: d.profile.batch ? String(d.profile.batch) : '', department: d.profile.department || '', session: d.profile.session || '', upazila: d.profile.upazila || '', union: d.profile.union || '', gender: d.profile.gender || '', bloodGroup: d.profile.bloodGroup || '' })
      setStep('profile')
    } else setStep(d.hasProfile ? 'has' : 'nothing')
  }

  const setPassword = async (e) => {
    e.preventDefault()
    if (busy) return
    if (pw.password.length < 8) { setPwErr(t('auth.e.pass')); return }
    if (pw.password !== pw.confirm) { setPwErr(t('auth.e.match')); return }
    setBusy(true); setPwErr('')
    try {
      const { error } = await supabase.auth.updateUser({ password: pw.password })
      if (error) throw error
      await loadProfile()
    } catch (err) {
      setPwErr(err?.code === 'weak_password' ? t('auth.e.pass') : t('ad.act2.passFailed'))
    } finally { setBusy(false) }
  }

  const upList = ups.data?.items || []
  const unions = useMemo(() => upList.find((u) => u.slug === v?.upazila)?.unions || [], [upList, v?.upazila])
  const text = (k) => (e) => setV({ ...v, [k]: e.target.value, ...(k === 'upazila' ? { union: '' } : {}) })

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    const bad = {}
    if (v.name.trim().length < 2) bad.name = t('auth.e.name')
    for (const k of ['batch', 'department', 'upazila', 'union']) if (!v[k]) bad[k] = t('auth.e.select')
    if (!/^\d{4}-\d{2}$/.test(v.session.trim())) bad.session = t('auth.sessionHint')
    setErrs(bad); setMsg('')
    if (Object.keys(bad).length) return
    setBusy(true)
    try {
      auth.set(await api('/me/profile', { method: 'POST', body: JSON.stringify({ ...v, name: v.name.trim(), session: v.session.trim(), batch: Number(v.batch) }) }))
      setStep('done')
    } catch (err) {
      if (err.fields) setErrs(err.fields)
      setMsg(t(errorKey(err) || 'ad.act2.submitFailed'))
    } finally { setBusy(false) }
  }

  const field = (k, label, input, hint) => (
    <label className="field" key={k}><span>{label}</span>{input}{hint && !errs[k] && <small className="muted">{hint}</small>}{errs[k] && <small className="err">{errs[k]}</small>}</label>
  )
  const select = (k, opts, optional) => (
    <select value={v[k]} onChange={text(k)} aria-invalid={!!errs[k]} disabled={k === 'union' && !v.upazila}>
      <option value="">{t(optional ? 'auth.genderNone' : 'auth.select')}</option>
      {opts.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
    </select>
  )

  return (
    <AuthShell wide>
      <div className="auth-card">
        <Logo size={44} />
        <h1>{t('ad.act2.title')}</h1>
        {step === 'checking' && <p className="muted" role="status">{t('auth.verifying')}</p>}
        {step === 'unavailable' && <p className="notice bad" role="alert">{t('ad.act2.unavailable')}</p>}
        {step === 'invalid' && (
          <div role="alert">
            <p className="notice bad">{t('ad.act2.invalid')}</p>
            <p className="muted">{t('ad.act2.invalidHelp')}</p>
            <Link className="btn btn-ghost btn-block" to="/forgot-password">{t('auth.forgot')}</Link>
            <Link className="btn btn-dark btn-block" to="/login">{t('nav.login')}</Link>
          </div>
        )}
        {step === 'password' && (
          <form onSubmit={setPassword} noValidate>
            <p className="notice ok" role="status">{t('ad.act2.emailOk')}</p>
            <p className="muted">{t('ad.act2.passIntro')}</p>
            <label className="field"><span>{t('auth.password')}</span><PasswordInput value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} autoComplete="new-password" aria-invalid={!!pwErr} /></label>
            <label className="field"><span>{t('auth.confirm')}</span><PasswordInput value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" aria-invalid={!!pwErr} /></label>
            {pwErr && <small className="err" role="alert">{pwErr}</small>}
            <button className="btn btn-dark btn-block" disabled={busy}>{busy ? t('state.loading') : t('ad.act2.continue')}</button>
          </form>
        )}
        {step === 'profile' && v && invite && (
          <form onSubmit={submit} noValidate>
            <p className="muted">{t('ad.act2.profileIntro')}</p>
            {field('name', t('auth.name'), <input value={v.name} onChange={text('name')} maxLength={80} aria-invalid={!!errs.name} />)}
            {field('batch', t('auth.batch'), select('batch', Array.from({ length: 25 }, (_, i) => 25 - i).map((b) => [String(b), `${t('auth.batch')} ${n(b)}`])))}
            {field('department', t('auth.dept'), select('department', (depts.data?.items || []).map((d) => [d, d])))}
            {field('session', t('auth.session'), <input value={v.session} onChange={text('session')} placeholder="2020-21" maxLength={7} aria-invalid={!!errs.session} />)}
            {field('upazila', t('auth.upazila'), select('upazila', upList.map((u) => [u.slug, pick(u.nameBn, u.nameEn)])))}
            {field('union', t('auth.union'), select('union', unions.map((x) => [x, x])))}
            {field('gender', t('auth.gender'), select('gender', [['female', t('ad.mem.female')], ['male', t('ad.mem.male')], ['other', t('ad.mem.other')]], true))}
            {field('bloodGroup', t('auth.blood'), select('bloodGroup', BLOOD.map((b) => [b, b]), true))}
            <p className="muted small">{t('ad.act2.pendingNote')}</p>
            {msg && <p className="notice bad" role="alert">{msg}</p>}
            <button className="btn btn-dark btn-block" disabled={busy}>{busy ? t('state.loading') : t('ad.act2.submit')}</button>
          </form>
        )}
        {step === 'done' && (
          <>
            <p className="notice ok" role="status">{t('ad.act2.done')}</p>
            <p className="muted">{t('ad.act2.pendingNote')}</p>
            <Link className="btn btn-dark btn-block" to="/dashboard">{t('auth.goDashboard')}</Link>
          </>
        )}
        {step === 'has' && <><p className="notice ok" role="status">{t('ad.act2.has')}</p><Link className="btn btn-dark btn-block" to="/dashboard">{t('auth.goDashboard')}</Link></>}
        {step === 'nothing' && <><p className="notice" role="status">{t('ad.act2.nothing')}</p><Link className="btn btn-dark btn-block" to="/dashboard">{t('auth.goDashboard')}</Link></>}
      </div>
    </AuthShell>
  )
}
