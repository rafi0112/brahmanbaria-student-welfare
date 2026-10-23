import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { uploadMedia } from '../lib/api.js'
import { folders, validTarget } from '../lib/favorites.js'
import { useFavorites } from './favorites.jsx'
import { navFor } from './nav.js'
import Icon from './icons.jsx'
export { slugFrom } from '../lib/slug.js'
import { useApp } from '../lib/app.jsx'
import { Pagination } from '../components/ui.jsx'

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

// Star beside a page title: add this exact view (path + filters) to Favorites, choose a name and folder, or remove it again.
export function PinButton({ label, to: toProp }) {
  const { t } = useApp()
  const fav = useFavorites()
  const loc = useLocation()
  const to = toProp || `${loc.pathname}${loc.search}`
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  const [err, setErr] = useState('')
  const box = useRef(null)
  const existing = fav?.isFav(to)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector('button')?.focus() } }
    addEventListener('mousedown', onDown)
    addEventListener('keydown', onKey)
    return () => { removeEventListener('mousedown', onDown); removeEventListener('keydown', onKey) }
  }, [open])
  if (!fav || !validTarget(to)) return null
  const flds = folders(fav.state)
  const toggle = () => {
    if (existing) { fav.remove(existing.id); return }
    const nav = navFor(loc.pathname, loc.search)
    setName(label || (nav ? t(nav.label) : '')); setFolder(''); setErr(''); setOpen(!open)
  }
  const save = (e) => {
    e.preventDefault()
    const r = fav.add(name, to, folder || undefined)
    if (r.ok) setOpen(false); else setErr(t(`ad.fav.err.${r.reason}`))
  }
  return (
    <span className="pin" ref={box}>
      <button type="button" className={`adm-iconbtn pin-btn ${existing ? 'on' : ''}`} aria-pressed={!!existing} onClick={toggle}
        aria-label={t(existing ? 'ad.fav.unpin' : 'ad.fav.pin')} title={t(existing ? 'ad.fav.unpin' : 'ad.fav.pin')}><Icon name="star" size={16} /></button>
      {open && (
        <form className="pin-pop" onSubmit={save} role="dialog" aria-label={t('ad.fav.pin')}>
          <label className="field compact"><span>{t('ad.fav.name')}</span><input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field compact"><span>{t('ad.fav.folder')}</span>
            <select value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="">{t('ad.fav.noFolder')}</option>
              {flds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          {err && <small className="err" role="alert">{err}</small>}
          <div className="row"><button type="submit" className="btn btn-dark btn-sm">{t('ad.fav.add')}</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>{t('admin.roles.cancel')}</button></div>
        </form>
      )}
    </span>
  )
}

export function PageHeader({ title, desc, action, crumbs, pin = true }) {
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
        <div><div className="ad-title"><h2>{title}</h2>{pin && <PinButton label={typeof title === 'string' ? title : undefined} />}</div>{desc && <p className="muted">{desc}</p>}</div>
        {action && <div className="ad-head-action">{action}</div>}
      </div>
    </header>
  )
}

// Status is a coloured dot plus the written status, so it never relies on colour alone.
export function StatusBadge({ status, label }) {
  const { t } = useApp()
  return <span className={`st st-${status}`}><span className="st-dot" aria-hidden="true" />{label || t(`ad.status.${status}`)}</span>
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
  const ref = useRef(null)
  // "/" jumps to the search box from anywhere on the page (not while typing elsewhere)
  useEffect(() => {
    const key = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return
      e.preventDefault(); ref.current?.focus()
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [])
  return (
    <>
      <input ref={ref} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder || t('ad.search')}
        aria-label={label || placeholder || t('ad.search')} maxLength={100} onKeyDown={(e) => { if (e.key === 'Escape' && text) { e.stopPropagation(); setText('') } }} />
      {text
        ? <button type="button" className="ad-search-clear" aria-label={t('common.clear')} onClick={() => { setText(''); ref.current?.focus() }}>×</button>
        : <kbd className="ad-search-kbd" aria-hidden="true">/</kbd>}
    </>
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

// `guard` runs before every close attempt (X, Escape, backdrop); returning true keeps the dialog open (unsaved changes).
export function Modal({ title, children, onClose, wide, busy, drawer, guard }) {
  const { t } = useApp()
  const labelId = useId()
  const box = useRef(null)
  const [leaving, setLeaving] = useState(false)
  // The latest props live in a ref so the effect below runs once. Re-running it on every parent render would restore
  // focus to the opener after each keystroke, which is what made text fields accept a single character.
  const live = useRef({})
  live.current = { onClose, busy, guard }
  const close = useCallback(() => {
    const { busy: working, guard: hold } = live.current
    if (working || hold?.()) return
    setLeaving(true)
    setTimeout(() => live.current.onClose?.(), 140)
  }, [])
  useEffect(() => {
    const prev = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') close()
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
  }, [close])
  return (
    <div className={`modal-back ad-back ${drawer ? 'is-drawer' : ''} ${leaving ? 'is-leaving' : ''}`} onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={box} className={`modal ad-modal ${wide ? 'ad-modal-wide' : ''} ${drawer ? 'ad-drawer' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelId}>
        <header className="ad-modal-head">
          <h3 id={labelId}>{title}</h3>
          <button type="button" className="ad-x" onClick={close} disabled={busy} aria-label={t('ad.close')}>×</button>
        </header>
        <div className="ad-modal-body">{children}</div>
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

// The second, stronger confirmation for actions that cannot be undone: the admin types an exact phrase (an email address)
// before the button works. The server checks the same phrase again.
export function TypeConfirm({ title, text, detail, expect, prompt, label, busy, error, onYes, onNo }) {
  const { t } = useApp()
  const [v, setV] = useState('')
  const okTyped = v.trim().toLowerCase() === String(expect).trim().toLowerCase()
  return (
    <Modal title={title} onClose={onNo} busy={busy}>
      <p>{text}</p>
      {detail}
      <label className="field compact"><span>{prompt}</span>
        <input value={v} onChange={(e) => setV(e.target.value)} autoFocus autoComplete="off" spellCheck={false} placeholder={expect} disabled={busy}
          onKeyDown={(e) => { if (e.key === 'Enter' && okTyped && !busy) onYes() }} /></label>
      {error && <p className="notice bad" role="alert">{error}</p>}
      <div className="row">
        <button type="button" className="btn btn-danger" disabled={busy || !okTyped} onClick={onYes}>{busy ? t('state.loading') : label}</button>
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
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://example.com/photo.jpg" inputMode="url" disabled={busy} />
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

// "More actions" menu: a button that opens a short list. Opens with click/Enter, moves with the arrow keys, closes with Escape.
// It is positioned with fixed coordinates so a table's overflow never clips it.
export function RowMenu({ label, items, className = '', icon }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: -999, left: 0 })
  const btn = useRef(null)
  const list = useRef(null)
  const live = items.filter(Boolean)
  // place the menu under its button, flip above when there is no room, and keep it inside the viewport
  const place = useCallback(() => {
    if (!btn.current || !list.current) return
    const r = btn.current.getBoundingClientRect()
    const h = list.current.offsetHeight
    const w = list.current.offsetWidth
    const below = r.bottom + 6
    const top = below + h > innerHeight - 8 ? Math.max(8, r.top - 6 - h) : below
    const left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8)
    setPos({ top, left })
  }, [])
  useLayoutEffect(() => { if (open) place() }, [open, place])
  useEffect(() => {
    if (!open) return undefined
    list.current?.querySelector('[role^=menuitem]:not([disabled])')?.focus()
    const close = () => setOpen(false)
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus() }
      const els = [...(list.current?.querySelectorAll('[role^=menuitem]:not([disabled])') || [])]
      const i = els.indexOf(document.activeElement)
      if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus() }
      if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus() }
    }
    const onDown = (e) => { if (!list.current?.contains(e.target) && !btn.current?.contains(e.target)) close() }
    addEventListener('keydown', onKey)
    addEventListener('mousedown', onDown)
    addEventListener('scroll', place, true) // the page may shift while it loads: follow the button instead of closing
    addEventListener('resize', place)
    return () => { removeEventListener('keydown', onKey); removeEventListener('mousedown', onDown); removeEventListener('scroll', place, true); removeEventListener('resize', place) }
  }, [open, place])
  if (live.length === 0) return null
  return (
    <>
      <button ref={btn} type="button" className={`btn btn-ghost btn-sm ad-more ${className}`} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen(!open)}>
        <Icon name="more" size={16} />
      </button>
      {open && createPortal(
        <ul ref={list} role="menu" className="ad-menu" aria-label={label} style={{ top: pos.top, left: pos.left }}>
          {live.map((it) => (
            <li key={it.label} role="none" className={it.sep ? 'has-sep' : ''}>
              {it.href
                ? <a role="menuitem" className={it.danger ? 'danger' : ''} href={it.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>{it.icon && <Icon name={it.icon} size={14} />}<span>{it.label}</span></a>
                : (
                  <button role={it.checked != null ? 'menuitemradio' : 'menuitem'} aria-checked={it.checked ?? undefined} type="button" className={it.danger ? 'danger' : ''} disabled={it.disabled} title={it.disabled ? it.why : undefined}
                    onClick={() => { setOpen(false); it.onClick() }}>
                    {it.icon && <Icon name={it.icon} size={14} />}<span>{it.label}</span>{it.hint && <small>{it.hint}</small>}{it.checked && <Icon name="check" size={14} className="mi-check" />}
                  </button>
                )}
            </li>
          ))}
        </ul>,
        document.querySelector('.adm') || document.body,
      )}
    </>
  )
}
