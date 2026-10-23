import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { Confirm, Modal, useErrText, useWhen } from './kit.jsx'

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const LEVELS = ['members', 'hidden']
const PHONE = /^01\d{9}$/

export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => [...w][0] || '').join('').toUpperCase() || '?'

// Black-and-white initials badge: no colour, so it works in both themes.
export function MonoAvatar({ name, size = 28 }) {
  return <span className="mono-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden="true">{initials(name)}</span>
}

const fromProfile = (p) => ({ phone: p?.phone || '', bloodGroup: p?.bloodGroup || '', showInDirectory: !!p?.showInDirectory, showPhone: p?.showPhone === 'hidden' ? 'hidden' : 'members', showEmail: p?.showEmail === 'hidden' ? 'hidden' : 'members', showBlood: p?.showBlood === 'hidden' ? 'hidden' : 'members' })

// "My profile": the signed-in person's own record. Only contact and visibility settings are editable here — the
// server accepts nothing else on /me/profile, so role, name, batch and department cannot be changed from this form.
export default function ProfileModal({ onClose }) {
  const { t, lang } = useApp()
  const { user, profile, set } = useAuth()
  const errText = useErrText()
  const when = useWhen(lang)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => fromProfile(profile))
  const [errs, setErrs] = useState({})
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [discard, setDiscard] = useState(false)

  const saved = useMemo(() => fromProfile(profile), [profile])
  const dirty = editing && JSON.stringify(form) !== JSON.stringify(saved)
  const guard = useCallback(() => { if (dirty) { setDiscard('close'); return true } return false }, [dirty])
  useEffect(() => { if (!editing) setForm(fromProfile(profile)) }, [profile, editing])

  const check = () => {
    const e = {}
    if (form.phone && !PHONE.test(form.phone)) e.phone = t('ad.me.errPhone')
    if (form.bloodGroup && !BLOOD.includes(form.bloodGroup)) e.bloodGroup = t('ad.me.errBlood')
    return e
  }
  const save = async (ev) => {
    ev.preventDefault()
    if (busy) return
    const e = check()
    setErrs(e); setMsg(null)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      set(await api('/me/profile', { method: 'PATCH', body: JSON.stringify(form) })) // success is shown only after the server answers
      setEditing(false)
      setMsg({ tone: 'ok', text: t('dash.saved') })
    } catch (err) {
      if (err.fields) setErrs(err.fields)
      setMsg({ tone: 'bad', text: errText(err) })
    } finally { setBusy(false) }
  }
  const cancel = () => { setForm(saved); setErrs({}); setMsg(null); setEditing(false) }
  const lvl = (v) => t(v === 'hidden' ? 'dash.show.hidden' : 'dash.show.members') // an older "public" value means the same as members now
  const row = (label, value) => <div><dt>{label}</dt><dd>{value || <span className="muted">{t('dash.notSet')}</span>}</dd></div>
  const name = profile?.name || user.email

  return (
    <>
      <Modal title={t('ad.me.title')} onClose={onClose} busy={busy} guard={guard} drawer>
        <div className="me-head">
          <MonoAvatar name={name} size={56} />
          <div><strong>{name}</strong><span className="muted">{user.email}</span></div>
        </div>
        <div aria-live="polite">{msg && <p className={`notice ${msg.tone}`} role={msg.tone === 'bad' ? 'alert' : 'status'}>{msg.text}</p>}</div>

        <dl className="me-facts">
          {row(t('ad.me.role'), user.role === 'admin' ? t('admin.roles.admin') : t('admin.roles.member'))}
          {row(t('ad.me.email'), user.emailVerified ? t('admin.roles.verified') : t('admin.roles.unverified'))}
          {profile && row(t('dash.status'), t(`ad.status.${profile.status}`))}
          {profile?.createdAt && row(t('ad.me.joined'), when(profile.createdAt))}
          {profile && row(t('students.batch'), profile.batch ? String(profile.batch) : '')}
          {profile && row(t('students.dept'), profile.department)}
          {profile && row(t('auth.upazila'), profile.upazila)}
          {profile && row(t('auth.union'), profile.union)}
        </dl>

        {!profile && <p className="muted small">{t('dash.noProfile')}</p>}

        {profile && !editing && (
          <>
            <h4 className="me-h">{t('dash.contact')}</h4>
            <dl className="me-facts">
              {row(t('dash.phone'), profile.phone)}
              {row(t('dash.bloodGroup'), profile.bloodGroup)}
              {row(t('dash.listed'), profile.showInDirectory ? t('ad.me.yes') : t('ad.me.no'))}
              {row(t('dash.show.phone'), lvl(profile.showPhone))}
              {row(t('dash.show.email'), lvl(profile.showEmail))}
              {row(t('dash.show.blood'), lvl(profile.showBlood))}
            </dl>
            <p className="muted small">{t('ad.me.lockedNote')}</p>
            <div className="row"><button type="button" className="btn btn-dark btn-sm" onClick={() => { setMsg(null); setEditing(true) }}>{t('ad.me.edit')}</button></div>
          </>
        )}

        {profile && editing && (
          <form onSubmit={save} noValidate className="me-form">
            <label className="field compact"><span>{t('dash.phone')}</span>
              <input autoFocus inputMode="numeric" value={form.phone} placeholder="01XXXXXXXXX" aria-invalid={!!errs.phone} disabled={busy} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              {errs.phone && <small className="err" role="alert">{errs.phone}</small>}
            </label>
            <label className="field compact"><span>{t('dash.bloodGroup')}</span>
              <select value={form.bloodGroup} disabled={busy} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
                <option value="">{t('dash.notSet')}</option>
                {BLOOD.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              {errs.bloodGroup && <small className="err" role="alert">{errs.bloodGroup}</small>}
            </label>
            <label className="check"><input type="checkbox" checked={form.showInDirectory} disabled={busy} onChange={(e) => setForm({ ...form, showInDirectory: e.target.checked })} />{t('dash.listed')}</label>
            {[['showPhone', 'dash.show.phone'], ['showEmail', 'dash.show.email'], ['showBlood', 'dash.show.blood']].map(([k, label]) => (
              <label className="field compact" key={k}><span>{t(label)}</span>
                <select value={form[k]} disabled={busy} onChange={(e) => setForm({ ...form, [k]: e.target.value })}>
                  {LEVELS.map((l) => <option key={l} value={l}>{lvl(l)}</option>)}
                </select>
                {errs[k] && <small className="err" role="alert">{errs[k]}</small>}
              </label>
            ))}
            <div className="row">
              <button type="submit" className="btn btn-dark btn-sm" disabled={busy || !dirty}>{busy ? t('state.loading') : t('ad.me.save')}</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => (dirty ? setDiscard('edit') : cancel())}>{t('admin.roles.cancel')}</button>
            </div>
          </form>
        )}
      </Modal>
      {discard && (
        <Confirm tone="danger" title={t('ad.me.discardTitle')} text={t('ad.me.discardText')} label={t('ad.me.discard')}
          onYes={() => { const leave = discard === 'close'; setDiscard(false); cancel(); if (leave) onClose() }} onNo={() => setDiscard(false)} />
      )}
    </>
  )
}
