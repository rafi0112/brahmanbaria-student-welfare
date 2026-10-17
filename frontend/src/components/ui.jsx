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
  return (
    <div className={wrap}>
      <img
        src={`/images/${id}-1280.webp`}
        srcSet={`/images/${id}-640.webp 640w, /images/${id}-1280.webp 1280w`}
        sizes={sizes}
        width={meta.w > 1280 ? 1280 : meta.w}
        height={Math.round((meta.h / meta.w) * Math.min(meta.w, 1280))}
        alt={alt ?? meta.alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        style={{ objectFit: fit }}
        onError={() => setFailed(true)}
      />
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

export function PageHero({ kicker, title, lede, image, children, shape = 'a' }) {
  return (
    <header className="page-hero">
      <div className="page-hero-inner wrap">
        <div className="page-hero-copy">
          {kicker && <p className="kicker">{kicker}</p>}
          <h1>{title}</h1>
          {lede && <p className="lede">{lede}</p>}
          {children}
        </div>
        {image && <Photo id={image} shape={`shape-${shape}`} sketch eager sizes="(min-width: 900px) 36vw, 90vw" />}
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
