import { Link } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { Badge, Photo, Avatar } from './ui.jsx'

export function PlaceCard({ p, upazilas = [] }) {
  const { t, pick } = useApp()
  const up = upazilas.find((u) => u.slug === p.upazila)
  return (
    <Link to={`/heritage/${p.slug}`} className="place-card">
      <Photo id={p.images[0]} shape="shape-b" sizes="(min-width: 900px) 30vw, 90vw" />
      <div className="place-card-body">
        <Badge tone="gold">{t(`cat.${p.category}`)}</Badge>
        <h3>{pick(p.nameBn, p.nameEn)}</h3>
        <p className="muted">{up ? pick(up.nameBn, up.nameEn) : pick('ব্রাহ্মণবাড়িয়া', 'Brahmanbaria')}</p>
        <span className={`verify ${p.verified ? 'yes' : 'no'}`}>{p.verified ? t('place.verified') : t('place.unverified')}</span>
      </div>
    </Link>
  )
}

export function PostCard({ p, big = false }) {
  const { t, pick, n } = useApp()
  return (
    <Link to={`/blog/${p.slug}`} className={`post-card ${big ? 'big' : ''}`}>
      <Photo id={p.image} shape="shape-a" sizes={big ? '(min-width: 900px) 50vw, 90vw' : '(min-width: 900px) 30vw, 90vw'} />
      <div className="post-card-body">
        <div className="row">
          <Badge tone="gold">{t(`cat.${p.category}`)}</Badge>
          {p.sample && <Badge tone="muted">{t('common.sample')}</Badge>}
        </div>
        <h3>{pick(p.titleBn, p.titleEn)}</h3>
        <p className="muted">{pick(p.excerptBn, p.excerptEn)}</p>
        <small className="muted">{p.date} · {n(p.readMin)} {t('blog.min')}</small>
      </div>
    </Link>
  )
}

export function StudentCard({ s, upazilas = [] }) {
  const { t, n, pick } = useApp()
  const up = upazilas.find((u) => u.slug === s.upazila)
  return (
    <Link to={`/students/${s.id}`} className="student-card">
      <Avatar name={s.name} size={64} />
      <h3>{s.name}</h3>
      <p>{s.department || '—'}</p>
      <p className="muted">
        {s.batch ? `${t('students.batch')} ${n(s.batch)}` : ''}{s.batch && up ? ' · ' : ''}{up ? pick(up.nameBn, up.nameEn).replace(' উপজেলা', '').replace(' Upazila', '') : ''}
      </p>
      <span className="link-arrow">{t('students.view')} →</span>
    </Link>
  )
}
