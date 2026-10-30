import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { useApi, qs } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useBase } from '../lib/base.js'
import { Badge, Credit, Crumbs, Data, Empty, MediaPhoto, PageHero } from '../components/ui.jsx'
import { PlaceCard } from '../components/cards.jsx'
import UpazilaMap from '../components/UpazilaMap.jsx'
import Icon from '../components/Icon.jsx'
import Reveal from '../components/Reveal.jsx'
import { CULTURE, DISCOVER } from '../data/explore.js'

const CATS = ['mosque', 'bridge', 'memorial', 'temple', 'railway', 'river', 'palace', 'shrine', 'lake', 'park', 'market', 'port', 'heritage-site']

export default function Heritage() {
  const base = useBase()
  const { t, n, pick } = useApp()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const f = { q: sp.get('q') || '', category: sp.get('category') || '', upazila: sp.get('upazila') || '' }
  const set = (patch) => {
    const next = { ...f, ...patch }
    const out = {}
    Object.entries(next).forEach(([k, v]) => { if (v) out[k] = v })
    setSp(out, { replace: true })
  }
  const res = useApi(`/heritage${qs(f)}`)
  const all = useApi('/heritage')
  const ups = useApi('/upazilas')
  const upazilas = ups.data?.items || []
  return (
    <>
      <PageHero kicker={t('heritage.kicker')} title={t('nav.heritage')} lede={t('heritage.lede')} src="/images/bswa/mosque.webp">
        <div className="banner-search" role="search">
          <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder={t('heritage.search')} aria-label={t('heritage.search')} />
          <span className="search-go" aria-hidden="true"><Icon name="search" size={18} /></span>
        </div>
        <div className="banner-chips" role="group" aria-label={t('heritage.category')}>
          <button className={`chip ${!f.category ? 'on' : ''}`} aria-pressed={!f.category} onClick={() => set({ category: '' })}>{t('heritage.all')}</button>
          {CATS.map((c) => <button key={c} className={`chip ${f.category === c ? 'on' : ''}`} aria-pressed={f.category === c} onClick={() => set({ category: c })}>{t(`cat.${c}`)}</button>)}
        </div>
      </PageHero>
      {/* explore Brahmanbaria: the district's story, its discovery cards and cultural pillars (moved here from the home page) */}
      <section className="section wrap heritage-explore" aria-labelledby="explore-h">
        <Reveal className="section-head">
          <div>
            <p className="eyebrow">{pick('অনেক গল্পের একটি জেলা', 'A district of many stories')}</p>
            <h2 id="explore-h">{pick('ঘুরে দেখুন ', 'Explore ')}<span className="hl">{pick('ব্রাহ্মণবাড়িয়া', 'Brahmanbaria')}</span></h2>
            <p className="lede">{pick('সমৃদ্ধ ইতিহাস, প্রাণবন্ত সংস্কৃতি, শান্ত নদী আর অনুপ্রেরণাদায়ী মানুষের জেলা। নয়টি উপজেলা জুড়ে এর ঐতিহ্য, প্রথা ও মানুষকে জানুন।', 'A land of rich history, vibrant culture, serene rivers and inspiring people. Discover its heritage, traditions and communities across nine upazilas.')}</p>
          </div>
        </Reveal>
        <div className="ex-cards">
          {DISCOVER.map((c, i) => (
            <Reveal key={c.to} delay={i * 70}>
              <Link to={c.to} className="ex-card">
                <span className="ex-thumb blob-c"><img src={c.img} alt="" loading="lazy" decoding="async" /></span>
                <span className="ex-card-copy"><b>{pick(c.bn, c.en)}</b><small>{pick(c.dbn, c.den)}</small></span>
                <span className="ex-arr" aria-hidden="true"><Icon name="arrow" size={14} /></span>
              </Link>
            </Reveal>
          ))}
        </div>
        <ul className="culture">
          {CULTURE.map((c) => (
            <li key={c.img}>
              <Link to={c.to} className="culture-card">
                <img src={`/images/bswa/${c.img}.webp`} alt="" loading="lazy" decoding="async" width={c.w} height={c.h} />
                <span className="culture-copy"><b>{pick(c.bn, c.en)}</b><small>{pick(c.sbn, c.sen)}</small></span>
                <Icon name="arrow" size={16} className="arr culture-arr" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="section wrap side-layout">
        <aside className="side-card">
          <h2>{t('common.search')}</h2>
          <label>{t('heritage.upazila')}
            <select value={f.upazila} onChange={(e) => set({ upazila: e.target.value })}>
              <option value="">{t('students.allUpazilas')}</option>
              {upazilas.map((u) => <option key={u.slug} value={u.slug}>{pick(u.nameBn, u.nameEn)}</option>)}
            </select>
          </label>
          <label>{t('heritage.category')}
            <select value={f.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">{t('heritage.all')}</option>
              {CATS.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}
            </select>
          </label>
          {(f.q || f.category || f.upazila) && <button className="btn btn-ghost btn-sm" onClick={() => setSp({}, { replace: true })}>{t('common.clear')}</button>}
          <h2>{t('heritage.byMap')}</h2>
          <UpazilaMap upazilas={upazilas} places={all.data?.items || []} selected={f.upazila} onSelect={(slug) => set({ upazila: f.upazila === slug ? '' : slug })} onPin={(p) => nav(`${base}/heritage/${p.slug}`)} />
        </aside>
        <div>
          <Data q={res} skeleton="cards">
            {(d) => (
              <>
                <p className="muted result-count" aria-live="polite">{n(d.total)} {t('heritage.found')}</p>
                {d.items.length === 0 ? <Empty /> : <div className="cards-2">{d.items.map((p) => <PlaceCard key={p.slug} p={p} upazilas={upazilas} />)}</div>}
              </>
            )}
          </Data>
        </div>
      </section>
    </>
  )
}

export function HeritageDetail() {
  const base = useBase()
  const { slug } = useParams()
  const { t, pick } = useApp()
  const res = useApi(`/heritage/${slug}`)
  const ups = useApi('/upazilas')
  const all = useApi('/heritage')
  const [img, setImg] = useState(0)
  return (
    <Data q={res} skeleton="detail">
      {(p) => {
        const up = (ups.data?.items || []).find((u) => u.slug === p.upazila)
        const at = Math.max(0, Math.min(img, p.images.length - 1))
        const cur = p.images[at]
        const curUrl = p.imageUrls?.[at]
        const nearby = (all.data?.items || []).filter((x) => x.slug !== p.slug).sort((a, b) => (b.upazila === p.upazila) - (a.upazila === p.upazila)).slice(0, 3)
        return (
          <>
            <div className="detail-banner">
              <PageHero image={p.images[0]} imageUrl={p.imageUrls?.[0]} title={pick(p.nameBn, p.nameEn)}>
                <div className="row">
                  <Badge tone="gold">{t(`cat.${p.category}`)}</Badge>
                  <span className={`verify ${p.verified ? 'yes' : 'no'}`} >{p.verified ? t('place.verified') : t('place.unverified')}</span>
                  {up && <Link to={`/directory/${up.slug}`}>📍 {pick(up.nameBn, up.nameEn)}</Link>}
                </div>
              </PageHero>
            </div>
            <section className="section wrap">
              <Crumbs items={[{ to: '/', label: t('nav.home') }, { to: `${base}/heritage`, label: t('nav.heritage') }, { label: pick(p.nameBn, p.nameEn) }]} />
              <div className="detail-grid">
                <article>
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
                <div>
                  <div className="gallery-grid">
                    <button className="big on" onClick={() => setImg(0)} aria-label={cur}><MediaPhoto id={cur} url={curUrl} shape="shape-r" eager sizes="(min-width: 900px) 45vw, 95vw" /></button>
                    {p.images.map((id, i) => (
                      <button key={id} className={i === img ? 'on' : ''} onClick={() => setImg(i)} aria-label={`${i + 1}`}><MediaPhoto id={id} url={p.imageUrls?.[i]} sizes="(min-width: 900px) 22vw, 45vw" /></button>
                    ))}
                  </div>
                  {!curUrl && cur && <Credit id={cur} />}
                </div>
              </div>
              <div className="nearby">
                <div className="section-head"><h2>{t('place.related')}</h2></div>
                <div className="cards-3">{nearby.map((x) => <PlaceCard key={x.slug} p={x} upazilas={ups.data?.items || []} />)}</div>
              </div>
            </section>
          </>
        )
      }}
    </Data>
  )
}
