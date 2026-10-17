import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { useApi } from '../lib/api.js'
import { Logo } from '../components/Sketch.jsx'

const emailOk = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())

const MODES = {
  login: { title: 'auth.login', sub: 'auth.loginSub', fields: ['email', 'password'], submit: 'auth.submitLogin' },
  register: { title: 'auth.register', sub: 'auth.registerSub', fields: ['name', 'batch', 'department', 'upazila', 'union', 'email', 'password', 'confirm', 'terms'], submit: 'auth.submitRegister' },
  forgot: { title: 'auth.forgot', sub: 'auth.forgotSub', fields: ['email'], submit: 'auth.sendLink' },
  reset: { title: 'auth.reset', sub: 'auth.resetSub', fields: ['password', 'confirm'], submit: 'auth.setPassword' },
}

export default function Auth({ mode }) {
  const { t, pick, n } = useApp()
  const nav = useNavigate()
  const cfg = MODES[mode]
  const depts = useApi(mode === 'register' ? '/departments' : null)
  const ups = useApi(mode === 'register' ? '/upazilas' : null)
  const [v, setV] = useState({ name: '', batch: '', department: '', upazila: '', union: '', email: '', password: '', confirm: '', terms: false, remember: false })
  const [errs, setErrs] = useState({})
  const [done, setDone] = useState(false)

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
  const submit = (ev) => {
    ev.preventDefault()
    const e = validate()
    setErrs(e)
    if (Object.keys(e).length) return
    if (mode === 'register') nav('/verify-email')
    else setDone(true)
  }
  const bind = (k) => ({ value: v[k], onChange: (e) => setV({ ...v, [k]: e.target.value }), 'aria-invalid': !!errs[k], 'aria-describedby': errs[k] ? `${k}-err` : undefined })
  const upList = ups.data?.items || []
  const unions = upList.find((u) => u.slug === v.upazila)?.unions || []
  const options = {
    batch: Array.from({ length: 25 }, (_, i) => 25 - i).map((b) => [b, `${t('auth.batch')} ${n(b)}`]),
    department: (depts.data?.items || []).map((d) => [d, d]),
    upazila: upList.map((u) => [u.slug, pick(u.nameBn, u.nameEn)]),
    union: unions.map((x) => [x, x]),
  }
  const setSel = (k) => (e) => setV({ ...v, [k]: e.target.value, ...(k === 'upazila' ? { union: '' } : {}) })
  const label = { batch: 'auth.batch', department: 'auth.dept', upazila: 'auth.upazila', union: 'auth.union', name: 'auth.name', email: 'auth.email', password: 'auth.password', confirm: 'auth.confirm' }

  return (
    <section className="auth-wrap">
      <img className="auth-art auth-art-l" src="/art/leaves-bl.webp" alt="" />
      <img className="auth-art auth-art-r" src="/art/vine-tl.webp" alt="" />
      <div className="auth-card">
        <Logo size={44} />
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
          <button className="btn btn-dark btn-block" type="submit">{t(cfg.submit)}</button>
          {done && <p className="notice ok" role="status">{t('auth.preview')}</p>}
        </form>
        <p className="muted center">
          {mode === 'login' && <>{t('auth.noAccount')} <Link to="/register">{t('nav.register')}</Link></>}
          {mode === 'register' && <>{t('auth.haveAccount')} <Link to="/login">{t('nav.login')}</Link></>}
          {(mode === 'forgot' || mode === 'reset') && <Link to="/login">← {t('auth.back')}</Link>}
        </p>
        {mode === 'login' && <p className="muted small center"><Link to="/reset-password">{t('auth.reset')}</Link> · <Link to="/verify-email">{t('auth.verify')}</Link></p>}
      </div>
    </section>
  )
}

export function Verify() {
  const { t } = useApp()
  const [sent, setSent] = useState(false)
  return (
    <section className="auth-wrap">
      <div className="auth-card center">
        <Logo size={44} />
        <svg viewBox="0 0 64 64" width="72" height="72" fill="none" stroke="var(--forest)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ filter: 'url(#rough)' }}>
          <rect x="8" y="14" width="48" height="36" rx="5" /><path d="m10 18 22 18 22-18" />
        </svg>
        <h1>{t('auth.verify')}</h1>
        <p className="muted">{t('auth.verifyBody')}</p>
        <button className="btn btn-ghost btn-block" onClick={() => setSent(true)}>{t('auth.resend')}</button>
        {sent && <p className="notice ok" role="status">{t('auth.preview')}</p>}
        <Link to="/login">← {t('auth.back')}</Link>
      </div>
    </section>
  )
}
