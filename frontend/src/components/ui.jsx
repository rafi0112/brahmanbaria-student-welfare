import { useState } from 'react'
import { Link } from 'react-router-dom'
import images from '../data/images.json'
import { usePhoto } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import Icon from './Icon.jsx'
import { Skeleton, SplitText } from './Motion.jsx'

// Responsive WebP photo with reserved dimensions and a graceful fallback.
// `shape` picks one of the slightly irregular frame styles.
export function Photo({ id, shape = '', sketch = false, eager = false, sizes = '(min-width: 900px) 40vw, 90vw', alt, className = '', fit = 'cover' }) {
  const [failed, setFailed] = useState(false)
  const meta = images[id]
  const wrap = `photo ${shape} ${sketch ? 'sketch-frame' : ''} ${className}`
  if (!meta || failed) {
    return <div className={`${wrap} photo-fallback`} role="img" aria-label={alt || meta?.alt || 'Photo unavailable'} />
  }
  const w = Math.min(meta.w, 1280)
  const set = [`/images/${id}-640.webp 640w`, `/images/${id}-1280.webp 1280w`]
  if (meta.wide) set.push(`/images/${id}-1920.webp 1920w`)
  return (
    <div className={wrap}>
      <img
        src={`/images/${id}-1280.webp`}
        srcSet={set.join(', ')}
        sizes={sizes}
        width={w}
        height={Math.round((meta.h / meta.w) * w)}
        alt={alt ?? meta.alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        style={{ objectFit: fit }}
        onError={() => setFailed(true)}
      />
    </div>
  )
}

// A picture that is either one of the bundled photos (id) or an uploaded file (url).
export function MediaPhoto({ id, url, shape = '', sketch = false, eager = false, sizes, alt, className = '' }) {
  const [failed, setFailed] = useState(false)
  if (!url) return <Photo id={id} shape={shape} sketch={sketch} eager={eager} sizes={sizes} alt={alt} className={className} />
  const wrap = `photo ${shape} ${sketch ? 'sketch-frame' : ''} ${className}`
  if (failed) return <div className={`${wrap} photo-fallback`} role="img" aria-label={alt || 'Photo unavailable'} />
  return (
    <div className={wrap}>
      <img src={url} alt={alt ?? ''} loading={eager ? 'eager' : 'lazy'} decoding="async" style={{ objectFit: 'cover' }} onError={() => setFailed(true)} />
    </div>
  )
}

export function Credit({ id }) {
  const { t } = useApp()
  const m = images[id]
  if (!m) return null
  return (
    <p className="credit">
      {t('place.photoCredit')}: {m.author} · <a href={m.source} target="_blank" rel="noreferrer">{m.license}</a>
    </p>
  )
}

// Password box with its own show/hide switch (each field toggles independently).
export function PasswordInput({ id, onKeyUp, onKeyDown, onBlur, ...props }) {
  const { t } = useApp()
  const [shown, setShown] = useState(false)
  const [caps, setCaps] = useState(false)
  const label = t(shown ? 'auth.hidePassword' : 'auth.showPassword')
  const readCaps = (e) => { if (e.getModifierState) setCaps(e.getModifierState('CapsLock')) }
  return (
    <>
    <span className="pw">
      <input id={id} {...props} type={shown ? 'text' : 'password'} spellCheck={false} autoCapitalize="off"
        onKeyUp={(e) => { readCaps(e); onKeyUp?.(e) }} onKeyDown={(e) => { readCaps(e); onKeyDown?.(e) }} onBlur={(e) => { setCaps(false); onBlur?.(e) }} />
      <button type="button" className="pw-toggle" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-label={label} title={label}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
    {caps && <small className="pw-caps" role="status">{t('pw.caps')}</small>}
    </>
  )
}

export function Loading() {
  const { t } = useApp()
  return <div className="state" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" />{t('state.loading')}</div>
}

export function Empty({ children, icon, title, action }) {
  const { t } = useApp()
  if (!icon && !title && !action) return <div className="state state-empty">{children || t('state.empty')}</div>
  return (
    <div className="state state-empty state-rich">
      {icon && <span className="state-ico" aria-hidden="true"><Icon name={icon} size={26} /></span>}
      {title && <h2 className="state-title">{title}</h2>}
      <p>{children || t('state.empty')}</p>
      {action && <div className="state-actions">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, retry }) {
  const { t } = useApp()
  return (
    <div className="state state-error" role="alert">
      <strong>{t('state.error')}</strong>
      {error?.code === 'no_api' || error?.code === 'bad_response' ? <span>{t('state.noApi')}</span>
        : error?.code === 'network' ? <span>{t('state.network')}</span>
        : <span>{error?.message}</span>}
      {import.meta.env.DEV && <span className="muted">{t('state.offlineHint')}</span>}
      {retry && <button className="btn btn-ghost" onClick={retry}>{t('state.retry')}</button>}
    </div>
  )
}

export function Data({ q, children, skeleton = 'block', count }) {
  const { t } = useApp()
  if (q.loading) return <div role="status" aria-live="polite" className="sk-wrap"><span className="sr-only">{t('state.loading')}</span><Skeleton kind={skeleton} count={count} /></div>
  if (q.error) return <ErrorState error={q.error} retry={q.retry} />
  // pages read fields of the answer; an empty answer is a broken response, not an empty list
  if (q.data == null || typeof q.data !== 'object') return <ErrorState error={{ code: 'bad_response' }} retry={q.retry} />
  return children(q.data)
}

export function Pagination({ page, pages, onPage }) {
  const { t, n } = useApp()
  if (pages <= 1) return null
  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>← {t('page.prev')}</button>
      <span className="num">{n(page)} {t('page.of')} {n(pages)}</span>
      <button className="btn btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('page.next')} →</button>
    </nav>
  )
}

export function Crumbs({ items }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => (
        <span key={i}>
          {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
          {i < items.length - 1 && <i aria-hidden="true">/</i>}
        </span>
      ))}
    </nav>
  )
}

// Page opening shared by every inner page: serif title (its last word set in the accent colour), a short lede, optional
// search or chips (`children`) and a photograph beside it. Decorative image, real text.
// variant gives each page its own picture treatment: vine, bleed, arch, circle, frame, collage, tilt, wave
export function PageHero({ kicker, title, lede, image, imageUrl, src, script, variant = 'vine', children }) {
  const { t } = useApp()
  let head = title, last = ''
  if (typeof title === 'string' && title.includes(' ')) {
    const i = title.lastIndexOf(' ')
    head = title.slice(0, i + 1)
    last = title.slice(i + 1)
  }
  return (
    <header className={`phero-wrap phero-v-${variant}`}>
      <div className="wrap phero">
        <div className="phero-copy">
          <nav className="phero-crumbs" aria-label={t('nav.breadcrumb')}><Link to="/">{t('nav.home')}</Link><span aria-hidden="true">/</span><span aria-current="page">{kicker || head}</span></nav>
          {kicker && <p className="eyebrow">{kicker}</p>}
          <h1 className="st-title"><SplitText text={head} />{last && <span className="hl"><SplitText text={last} start={head.split(/\s+/).length} /></span>}</h1>
          {lede && <p className="phero-lede">{lede}</p>}
          {children}
        </div>
        <div className="phero-media">
          {src ? <img className="phero-img" src={src} alt="" width="700" height="460" fetchpriority="high" /> : <MediaPhoto id={image} url={imageUrl} eager sizes="(min-width: 1000px) 48vw, 100vw" alt="" />}
        </div>
        {script && <p className="phero-script" aria-hidden="true">{script}</p>}
        <span className="phero-deco phero-deco-a" aria-hidden="true" /><span className="phero-deco phero-deco-b" aria-hidden="true" />
      </div>
    </header>
  )
}

export function Badge({ tone = 'leaf', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function initials(name) {
  const p = name.trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

// A person's picture: their photo when one exists and this viewer may see it, otherwise a monogram in one of four soft
// palette tints chosen from the name (so it stays the same for the same person).
export function Avatar({ name, size = 52, photo, className = '' }) {
  const src = usePhoto(photo)
  let h = 0
  for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) % 997
  const tint = ['peach', 'teal', 'orange', 'sand'][h % 4]
  if (src) return <img className={`avatar avatar-img ${className}`} src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
  return (
    <span className={`avatar tint-${tint} ${className}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {initials(name || '?')}
    </span>
  )
}

// Soft botanical line art scattered down the page edges (the "leaf" page background).
export function PageLeaves() {
  return (
    <div className="page-bg" aria-hidden="true">
      <img className="pb pb-1" src="/art/vine-tl.webp" alt="" loading="lazy" />
      <img className="pb pb-2" src="/art/leaves-bl.webp" alt="" loading="lazy" />
      <img className="pb pb-3" src="/art/sprig.webp" alt="" loading="lazy" />
      <img className="pb pb-4" src="/art/flowers-br.webp" alt="" loading="lazy" />
      <img className="pb pb-5" src="/art/vine-tl.webp" alt="" loading="lazy" />
    </div>
  )
}

// The verified mark next to a name: an approved member whose email is confirmed. Same mark on every page.
export function VerifiedMark({ size = 16 }) {
  const { t } = useApp()
  return <span className="vmark" title={t('verified.mark')} aria-label={t('verified.mark')} role="img"><Icon name="verified" size={size} /></span>
}
