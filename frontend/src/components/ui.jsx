import { useState } from 'react'
import { Link } from 'react-router-dom'
import images from '../data/images.json'
import { useApp } from '../lib/app.jsx'

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
export function PasswordInput({ id, ...props }) {
  const { t } = useApp()
  const [shown, setShown] = useState(false)
  const label = t(shown ? 'auth.hidePassword' : 'auth.showPassword')
  return (
    <span className="pw">
      <input id={id} {...props} type={shown ? 'text' : 'password'} />
      <button type="button" className="pw-toggle" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-label={label} title={label}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
  )
}

export function Loading() {
  const { t } = useApp()
  return <div className="state" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" />{t('state.loading')}</div>
}

export function Empty({ children }) {
  const { t } = useApp()
  return <div className="state state-empty">{children || t('state.empty')}</div>
}

export function ErrorState({ error, retry }) {
  const { t } = useApp()
  return (
    <div className="state state-error" role="alert">
      <strong>{t('state.error')}</strong>
      <span>{error?.message}</span>
      <span className="muted">{t('state.offlineHint')}</span>
      {retry && <button className="btn btn-ghost" onClick={retry}>{t('state.retry')}</button>}
    </div>
  )
}

export function Data({ q, children }) {
  if (q.loading) return <Loading />
  if (q.error) return <ErrorState error={q.error} retry={q.retry} />
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

// Rounded banner with a photo, dark overlay and white serif title (matches the page mockups).
// `children` is rendered inside the banner (search box, filter chips).
export function PageHero({ kicker, title, lede, image, imageUrl, children }) {
  return (
    <header className="page-banner-wrap wrap">
      <div className="page-banner">
        <MediaPhoto id={image} url={imageUrl} eager className="banner-photo" sizes="(min-width: 1200px) 1180px, 100vw" alt="" />
        <div className="banner-shade" />
        <div className="banner-copy">
          {kicker && <p className="kicker kicker-light">{kicker}</p>}
          <h1>{title}</h1>
          {lede && <p className="lede">{lede}</p>}
          {children}
        </div>
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

export function Avatar({ name, size = 52 }) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return (
    <span className="avatar" style={{ width: size, height: size, background: `hsl(${(h % 60) + 95} 28% 32%)`, fontSize: size * 0.36 }} aria-hidden="true">
      {initials(name)}
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
