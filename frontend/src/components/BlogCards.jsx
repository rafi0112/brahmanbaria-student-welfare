import { Link } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { useBase } from '../lib/base.js'
import { MediaPhoto } from './ui.jsx'
import Icon from './Icon.jsx'
import { initials } from '../lib/initials.js'

// Blog cards for the Blog page: one large story at the top, then an even grid. Every word comes from the post (or the
// site's texts); a post without a picture gets a calm, branded panel instead of an empty frame.

const plain = (s) => String(s || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`]/g, '').replace(/\s+/g, ' ').trim()

export function excerptOf(p, pick, max = 170) {
  const ex = pick(p.excerptBn, p.excerptEn)
  if (ex) return ex
  const body = plain((pick(p.bodyBn, p.bodyEn) || []).join(' '))
  return body.length > max ? `${body.slice(0, body.lastIndexOf(' ', max) > max / 2 ? body.lastIndexOf(' ', max) : max)}…` : body
}

export function useNiceDate() {
  const { lang } = useApp()
  return (d) => {
    const x = d ? new Date(`${d.slice(0, 10)}T00:00:00`) : null
    return x && !Number.isNaN(x.getTime()) ? x.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  }
}

function Cover({ p, sizes, eager }) {
  const { pick } = useApp()
  if (!p.image && !p.imageUrl) {
    return (
      <div className="bc-blank" aria-hidden="true">
        <img src="/logo-512.png" alt="" loading="lazy" decoding="async" />
      </div>
    )
  }
  return <MediaPhoto id={p.image} url={p.imageUrl} alt={p.imageAlt || pick(p.titleBn, p.titleEn)} sizes={sizes} eager={eager} />
}

function Byline({ p }) {
  const { t, n } = useApp()
  const nice = useNiceDate()
  return (
    <div className="bc-by">
      {p.author && <span className="bc-avatar" aria-hidden="true">{initials(p.author)}</span>}
      <span className="bc-by-text">
        {p.author && <b>{p.author}</b>}
        <small><time dateTime={p.date}>{nice(p.date)}</time> · {n(p.readMin || 1)} {t('blog.min')}</small>
      </span>
    </div>
  )
}

export function BlogFeature({ p }) {
  const { t, pick } = useApp()
  const base = useBase()
  return (
    <Link to={`${base}/blog/${p.slug}`} className="bc-feature">
      <div className="bc-media"><Cover p={p} eager sizes="(min-width: 900px) 55vw, 95vw" /></div>
      <div className="bc-feature-body">
        <span className="bc-cat">{t(`cat.${p.category}`)}</span>
        <h2>{pick(p.titleBn, p.titleEn)}</h2>
        <p>{excerptOf(p, pick, 240)}</p>
        <Byline p={p} />
        <span className="bc-read">{t('blog.read')} <Icon name="arrow" size={16} /></span>
      </div>
    </Link>
  )
}

export function BlogCard({ p }) {
  const { t, pick } = useApp()
  const base = useBase()
  return (
    <Link to={`${base}/blog/${p.slug}`} className="bc-card">
      <div className="bc-media">
        <Cover p={p} sizes="(min-width: 1100px) 360px, (min-width: 700px) 45vw, 95vw" />
        <span className="bc-cat bc-cat-on">{t(`cat.${p.category}`)}</span>
      </div>
      <div className="bc-body">
        <h3>{pick(p.titleBn, p.titleEn)}</h3>
        <p>{excerptOf(p, pick)}</p>
        <Byline p={p} />
      </div>
    </Link>
  )
}
