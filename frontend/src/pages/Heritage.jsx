import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { useApi, qs } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Badge, Credit, Crumbs, Data, Empty, PageHero, Photo } from '../components/ui.jsx'
import { PlaceCard } from '../components/cards.jsx'

const CATS = ['mosque', 'bridge', 'memorial', 'temple', 'railway', 'river']

export default function Heritage() {
  const { t, n, pick } = useApp()
  const [sp, setSp] = useSearchParams()
  const f = { q: sp.get('q') || '', category: sp.get('category') || '', upazila: sp.get('upazila') || '' }
  const set = (patch) => {
    const next = { ...f, ...patch }
    const out = {}
    Object.entries(next).forEach(([k, v]) => { if (v) out[k] = v })
    setSp(out, { replace: true })
  }
  const res = useApi(`/heritage${qs(f)}`)
  const ups = useApi('/upazilas')
  const upazilas = ups.data?.items || []
  return (
    <>
      <PageHero kicker={t('heritage.kicker')} title={t('nav.heritage')} lede={t('heritage.lede')} image="arifail-06" shape="a" />
      <section className="section wrap">
        <div className="filters">
          <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder={t('heritage.search')} aria-label={t('heritage.search')} />
          <select value={f.upazila} onChange={(e) => set({ upazila: e.target.value })} aria-label={t('heritage.upazila')}>
            <option value="">{t('students.allUpazilas')}</option>
            {upazilas.map((u) => <option key={u.slug} value={u.slug}>{pick(u.nameBn, u.nameEn)}</option>)}
          </select>
        </div>
        <div className="chips" role="group" aria-label={t('heritage.category')}>
          <button className={`chip ${!f.category ? 'on' : ''}`} aria-pressed={!f.category} onClick={() => set({ category: '' })}>{t('heritage.all')}</button>
          {CATS.map((c) => <button key={c} className={`chip ${f.category === c ? 'on' : ''}`} aria-pressed={f.category === c} onClick={() => set({ category: c })}>{t(`cat.${c}`)}</button>)}
        </div>
        <Data q={res}>
          {(d) => (
            <>
              <p className="muted result-count" aria-live="polite">{n(d.total)} {t('heritage.found')}</p>
              {d.items.length === 0 ? <Empty /> : <div className="cards-3">{d.items.map((p) => <PlaceCard key={p.slug} p={p} upazilas={upazilas} />)}</div>}
            </>
          )}
        </Data>
      </section>
    </>
  )
}

export function HeritageDetail() {
  const { slug } = useParams()
  const { t, pick } = useApp()
  const res = useApi(`/heritage/${slug}`)
  const ups = useApi('/upazilas')
  const [img, setImg] = useState(0)
  return (
    <section className="section wrap">
      <Data q={res}>
        {(p) => {
          const up = (ups.data?.items || []).find((u) => u.slug === p.upazila)
          const cur = p.images[Math.min(img, p.images.length - 1)]
          return (
            <>
              <Crumbs items={[{ to: '/', label: t('nav.home') }, { to: '/heritage', label: t('nav.heritage') }, { label: pick(p.nameBn, p.nameEn) }]} />
              <div className="detail-grid">
                <div>
                  <Photo id={cur} shape="shape-a" sketch eager sizes="(min-width: 900px) 55vw, 95vw" />
                  <Credit id={cur} />
                  {p.images.length > 1 && (
                    <div className="thumbs">
                      {p.images.map((id, i) => (
                        <button key={id} className={i === img ? 'on' : ''} onClick={() => setImg(i)} aria-label={`${i + 1}`}><Photo id={id} sizes="120px" /></button>
                      ))}
                    </div>
                  )}
                </div>
                <article>
                  <div className="row">
                    <Badge tone="gold">{t(`cat.${p.category}`)}</Badge>
                    <span className={`verify ${p.verified ? 'yes' : 'no'}`}>{p.verified ? t('place.verified') : t('place.unverified')}</span>
                  </div>
                  <h1>{pick(p.nameBn, p.nameEn)}</h1>
                  {up && <p className="muted">{t('place.on')}: <Link to={`/directory/${up.slug}`}>{pick(up.nameBn, up.nameEn)}</Link></p>}
                  <p className="lede">{p.summary}</p>
                  <p>{p.details || <em className="muted">{t('place.noDetails')}</em>}</p>
                  {p.facts.length > 0 && (
                    <>
                      <h2>{t('place.facts')}</h2>
                      <dl className="facts">{p.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
                    </>
                  )}
                  <h2>{t('place.sources')}</h2>
                  <ul className="sources">{p.sources.map((s) => <li key={s}><a href={s} target="_blank" rel="noreferrer">{s.replace('https://', '')}</a></li>)}</ul>
                  <p className="muted small">{t('place.lastVerified')}: {p.lastVerified}</p>
                </article>
              </div>
            </>
          )
        }}
      </Data>
    </section>
  )
}
