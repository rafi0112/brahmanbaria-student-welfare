import { Link } from 'react-router-dom'
import { useBase } from '../lib/base.js'
import { useApp } from '../lib/app.jsx'
import { usePhoto } from '../lib/api.js'
import { Badge, MediaPhoto, VerifiedMark, initials } from './ui.jsx'
import Icon from './Icon.jsx'

export function PlaceCard({ p, upazilas = [] }) {
  const { t, pick } = useApp()
  const base = useBase()
  const up = upazilas.find((u) => u.slug === p.upazila)
  return (
    <Link to={`${base}/heritage/${p.slug}`} className="place-card">
      <MediaPhoto id={p.images?.[0]} url={p.imageUrls?.[0]} shape="shape-r" sizes="(min-width: 900px) 30vw, 90vw" />
      <div className="place-card-body">
        <span className="tag-outline">{t(`cat.${p.category}`)}</span>
        <div className="place-card-row">
          <div>
            <h3>{pick(p.nameBn, p.nameEn)}</h3>
            <p className="muted loc"><Icon name="pin" size={14} /> {up ? pick(up.nameBn, up.nameEn) : pick('ব্রাহ্মণবাড়িয়া', 'Brahmanbaria')}</p>
          </div>
          <span className="round-arrow" aria-hidden="true"><Icon name="arrow" size={16} /></span>
        </div>
        <span className={`verify ${p.verified ? 'yes' : 'no'}`}>{p.verified ? t('place.verified') : t('place.unverified')}</span>
      </div>
    </Link>
  )
}

export function PostCard({ p, big = false }) {
  const { t, pick, n } = useApp()
  const base = useBase()
  return (
    <Link to={`${base}/blog/${p.slug}`} className={`post-card ${big ? 'big' : ''}`}>
      <div className="post-img">
        <MediaPhoto id={p.image} url={p.imageUrl} shape="shape-r" sizes={big ? '(min-width: 900px) 50vw, 90vw' : '(min-width: 900px) 30vw, 90vw'} />
        <span className="img-tag">{t(`cat.${p.category}`)}</span>
      </div>
      <div className="post-card-body">
        <h3>{pick(p.titleBn, p.titleEn)}</h3>
        <p className="muted">{pick(p.excerptBn, p.excerptEn)}</p>
        <small className="muted meta"><Icon name="calendar" size={14} /> {p.date} <Icon name="clock" size={14} /> {n(p.readMin)} {t('blog.min')} {p.sample && <Badge tone="muted">{t('common.sample')}</Badge>}</small>
      </div>
    </Link>
  )
}

const TINTS = ['peach', 'teal', 'orange', 'sand']
function tintOf(name) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997; return TINTS[h % TINTS.length] }

// A student in the directory: a monogram panel (no portraits are stored), then name, department, batch and place.
// Members see extra details only when the API sends them.
export function StudentCard({ s, upazilas = [] }) {
  const { t, n, pick } = useApp()
  const base = useBase()
  const up = upazilas.find((u) => u.slug === s.upazila)
  const place = up ? pick(up.nameBn, up.nameEn).replace(' উপজেলা', '').replace(' Upazila', '') : ''
  const photo = usePhoto(s.photo || s.details?.photoUrl)
  return (
    <Link to={`${base}/students/${s.id}`} className="student-card">
      <span className={`sc-mono tint-${tintOf(s.name)}`} aria-hidden="true">{photo ? <img src={photo} alt="" /> : <b>{initials(s.name)}</b>}<span className="sc-go"><Icon name="arrow" size={15} /></span></span>
      <span className="student-info">
        <h3>{s.name}{s.verified && <VerifiedMark size={15} />}</h3>
        <p className="sc-dept">{s.department || '—'}</p>
        <p className="sc-meta">
          {s.batch ? <span>{t('students.batch')} {n(s.batch)}</span> : null}
          {place ? <span><Icon name="pin" size={13} /> {place}</span> : null}
        </p>
        {s.details && (s.details.phone || s.details.bloodGroup) && (
          <p className="student-extra">
            {s.details.phone && <span className="num">{s.details.phone}</span>}
            {s.details.bloodGroup && <span className="chip-mini chip-blood">{s.details.bloodGroup}</span>}
          </p>
        )}
      </span>
    </Link>
  )
}
