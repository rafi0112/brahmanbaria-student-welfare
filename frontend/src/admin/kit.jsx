import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { uploadMedia } from '../lib/api.js'
export { slugFrom } from '../lib/slug.js'
import { useApp } from '../lib/app.jsx'
import { Badge, Pagination } from '../components/ui.jsx'

/* ---------------------------------------------------------------- state helpers */

// Filters that live in the URL, so refresh, back/forward and shared links all keep them.
export function useFilters(defaults) {
  const [sp, setSp] = useSearchParams()
  const keys = Object.keys(defaults)
  const values = {}
  keys.forEach((k) => { values[k] = sp.get(k) ?? defaults[k] })
  const set = useCallback((patch) => {
    const next = new URLSearchParams(sp)
    Object.entries(patch).forEach(([k, v]) => {
      if (v === '' || v == null || v === defaults[k]) next.delete(k)
      else next.set(k, String(v))
    })
    if (!('page' in patch)) next.delete('page') // a changed filter starts again from page 1
    setSp(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, setSp])
  return [values, set]
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id) }, [value, ms])
  return v
}

// Warns before the tab is closed while a form has unsaved changes.
export function useUnsavedGuard(dirty) {
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [dirty])
}

export function useNotice() {
  const [notice, setNotice] = useState(null)
  const ok = useCallback((text) => setNotice({ tone: 'ok', text }), [])
  const bad = useCallback((text) => setNotice({ tone: 'bad', text }), [])
  const clear = useCallback(() => setNotice(null), [])
  return { notice, ok, bad, clear }
}

// Server error codes are stable strings; every code has a translated message.
export function useErrText() {
  const { t } = useApp()
  return useCallback((err) => {
    if (!err || err.status === 0 || err.name === 'TypeError') return t('ad.e.network')
    const key = `ad.e.${err.message}`
    const text = t(key)
    if (text !== key) return text
    if (err.status === 401) return t('ad.e.signin')
    if (err.status === 403) return t('ad.e.forbidden')
    return t('ad.e.generic')
  }, [t])
}

/* ---------------------------------------------------------------- display pieces */

export function PageHeader({ title, desc, action, crumbs }) {
  return (
    <header className="ad-head">
      {crumbs && (
        <nav className="ad-crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={i}>{c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}{i < crumbs.length - 1 && <span aria-hidden="true"> / </span>}</span>
          ))}
        </nav>
      )}
      <div className="ad-head-row">
        <div><h2>{title}</h2>{desc && <p className="muted">{desc}</p>}</div>
        {action && <div className="ad-head-action">{action}</div>}
      </div>
    </header>
  )
}

const STATUS = { published: ['●', 'gold'], draft: ['○', 'muted'], archived: ['▣', 'muted'], pending: ['◔', 'gold'], approved: ['●', 'leaf'], rejected: ['✕', 'muted'] }

// Status is always written out as well as coloured, so it never relies on colour alone.
export function StatusBadge({ status, label }) {
  const { t } = useApp()
  const [mark, tone] = STATUS[status] || ['•', 'muted']
  return <Badge tone={tone}><span aria-hidden="true">{mark} </span>{label || t(`ad.status.${status}`)}</Badge>
}

export function Notice({ notice, onClose }) {
  const { t } = useApp()
  return (
    <div aria-live="polite">
      {notice && (
        <p className={`notice ${notice.tone} ad-notice`} role={notice.tone === 'bad' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          {onClose && <button type="button" className="ad-x" onClick={onClose} aria-label={t('ad.dismiss')}>×</button>}
        </p>
      )}
    </div>
  )
}

export function SkeletonRows({ rows = 5 }) {
  const { t } = useApp()
  return (
    <div className="ad-skel" role="status" aria-label={t('state.loading')}>
      {Array.from({ length: rows }, (_, i) => <span key={i} className="ad-skel-row" />)}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder, label }) {
  const { t } = useApp()
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const debounced = useDebounced(text)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (debounced !== value) onChange(debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])
  return (
    <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder || t('ad.search')}
      aria-label={label || placeholder || t('ad.search')} maxLength={100} />
  )
}

export function Select({ value, onChange, label, options, all }) {
  const { t } = useApp()
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{all || t('ad.all')}</option>
      {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  )
}

// Pagination with a page-size choice and the matching-record count.
export function Pager({ total, page, pages, limit, onPage, onLimit }) {
  const { t, n } = useApp()
  return (
    <div className="ad-pager">
      <span className="muted small" aria-live="polite">{n(total)} {t('ad.records')}</span>
      <Pagination page={page} pages={pages} onPage={onPage} />
      {onLimit && (
        <label className="ad-size"><span className="muted small">{t('ad.perPage')}</span>
          <select value={limit} onChange={(e) => onLimit(e.target.value)} aria-label={t('ad.perPage')}>
            {[10, 20, 50, 100].map((v) => <option key={v} value={v}>{n(v)}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}

export function Field({ label, required, hint, error, count, max, children, id }) {
  const { t, n } = useApp()
  const auto = useId()
  const fid = id || auto
  return (
    <div className="ad-field">
      <label htmlFor={fid}>
        {label}{' '}
        <small className="muted">{required ? t('ad.required') : t('ad.optional')}</small>
        {max ? <small className="muted ad-count"> {n(count ?? 0)}/{n(max)}</small> : null}
      </label>
      {children(fid, !!error)}
      {hint && !error && <small className="muted">{hint}</small>}
      {error && <small className="err" role="alert">{error}</small>}
    </div>
  )
}

/* ---------------------------------------------------------------- dialogs */

export function Modal({ title, children, onClose, wide, busy }) {
  const { t } = useApp()
  const labelId = useId()
  const box = useRef(null)
  useEffect(() => {
    const prev = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
      if (e.key === 'Tab' && box.current) { // keep keyboard focus inside the dialog
        const f = box.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
        if (!f.length) return
        const first = f[0]; const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.() }
  }, [onClose, busy])
  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={box} className={`modal ad-modal ${wide ? 'ad-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelId}>
        <header className="ad-modal-head">
          <h3 id={labelId}>{title}</h3>
          <button type="button" className="ad-x" onClick={onClose} disabled={busy} aria-label={t('ad.close')}>×</button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function Confirm({ title, text, detail, label, tone, busy, onYes, onNo }) {
  const { t } = useApp()
  return (
    <Modal title={title || t('ad.confirmTitle')} onClose={onNo} busy={busy}>
      <p>{text}</p>
      {detail}
      <div className="row">
        <button type="button" className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-dark'}`} autoFocus disabled={busy} onClick={onYes}>{busy ? t('state.loading') : label}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onNo}>{t('admin.roles.cancel')}</button>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------- images */

const ACCEPT = ['image/jpeg', 'image/png']
const MAX = 5 * 1024 * 1024

// One picture: choose a file (preview first, upload with progress) or paste a Google Drive link.
// onChange gets { path, url } once the server has stored the file, or null when it is removed.
export function ImagePicker({ label, value, url, onChange, hint, legacyUrl }) {
  const { t } = useApp()
  const errText = useErrText()
  const input = useRef(null)
  const [local, setLocal] = useState('')
  const [progress, setProgress] = useState(null)
  const [err, setErr] = useState('')
  const [link, setLink] = useState('')
  const [broken, setBroken] = useState(false)
  useEffect(() => () => local && URL.revokeObjectURL(local), [local])
  const busy = progress !== null
  const shown = local || url || legacyUrl

  const send = async (opts, preview) => {
    setErr(''); setBroken(false); setProgress(0)
    if (preview) setLocal(preview)
    try {
      const r = await uploadMedia({ ...opts, onProgress: setProgress })
      onChange({ path: r.path, url: r.url })
    } catch (e) {
      setErr(errText(e))
      if (preview) setLocal('')
    } finally { setProgress(null) }
  }
  const pick = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!ACCEPT.includes(f.type)) { setErr(t('ad.e.file_type')); return }
    if (f.size > MAX) { setErr(t('ad.e.photo_too_big')); return }
    send({ file: f }, URL.createObjectURL(f))
  }
  return (
    <fieldset className="photo-picker ad-image">
      <legend>{label}</legend>
      <div className="photo-row">
        {shown && !broken
          ? <img className="exec-thumb ad-thumb" src={shown} alt={t('ad.preview')} width={96} height={96} onError={() => setBroken(true)} />
          : <span className="exec-thumb exec-thumb-empty" aria-hidden="true" />}
        <div className="photo-controls">
          <input ref={input} type="file" accept={ACCEPT.join(',')} onChange={pick} hidden />
          <div className="row">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => input.current?.click()}>{value || url ? t('ad.replacePhoto') : t('ad.choosePhoto')}</button>
            {(value || local) && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { onChange(null); setLocal(''); setErr('') }}>{t('ad.removePhoto')}</button>}
          </div>
          <label className="field compact"><span>{t('ad.driveLink')}</span>
            <span className="row">
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/file/d/…" inputMode="url" disabled={busy} />
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !link.trim()} onClick={() => send({ driveUrl: link.trim() }, '').then(() => setLink(''))}>{t('ad.useLink')}</button>
            </span>
          </label>
          <small className="muted">{hint || t('ad.photoHelp')}</small>
          {busy && (
            <div role="status" aria-label={t('ad.uploading')}>
              <progress max="100" value={progress} /> <small>{t('ad.uploading')} {progress}%</small>
            </div>
          )}
          {!busy && value && !err && !broken && <small className="ok-text" role="status">{t('ad.photoOk')}</small>}
          {broken && <small className="err" role="alert">{t('ad.e.photo_show')}</small>}
          {err && <small className="err" role="alert">{err}</small>}
        </div>
      </div>
    </fieldset>
  )
}

/* ---------------------------------------------------------------- misc */

export function useWhen(lang) {
  return useMemo(() => (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  }, [lang])
}

export function EmptyState({ title, text, action }) {
  return (
    <div className="state state-empty ad-empty">
      <strong>{title}</strong>
      {text && <span className="muted">{text}</span>}
      {action}
    </div>
  )
}
