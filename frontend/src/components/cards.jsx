import { Link } from 'react-router-dom'
import { useBase } from '../lib/base.js'
import { useApp } from '../lib/app.jsx'
import { Badge, MediaPhoto, Avatar } from './ui.jsx'
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

export function StudentCard({ s, upazilas = [] }) {
  const { t, n, pick } = useApp()
  const base = useBase()
  const up = upazilas.find((u) => u.slug === s.upazila)
  return (
    <Link to={`${base}/students/${s.id}`} className="student-card">
      <Avatar name={s.name} size={58} />
      <div className="student-info">
        <h3>{s.name}</h3>
        <p>{s.department || '—'}</p>
        <p className="muted">
          {s.batch ? `${t('students.batch')} ${n(s.batch)}` : ''}{s.batch && up ? ' · ' : ''}{up ? pick(up.nameBn, up.nameEn).replace(' উপজেলা', '').replace(' Upazila', '') : ''}
        </p>
        {s.details && (
          <p className="student-extra">
            {s.details.session && <span>{s.details.session}</span>}
            {s.details.phone && <span className="num">{s.details.phone}</span>}
            {s.details.bloodGroup && <span className="chip-mini">{s.details.bloodGroup}</span>}
          </p>
        )}
      </div>
      <span className="pill-btn">{t('students.view')}</span>
    </Link>
  )
}
