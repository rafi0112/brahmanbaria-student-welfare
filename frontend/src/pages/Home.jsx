import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import UpazilaMap from '../components/UpazilaMap.jsx'
import { Photo, Badge } from '../components/ui.jsx'
import { PlaceCard, PostCard } from '../components/cards.jsx'
import { Leaves, Monument, Students as StudentsSketch, Wave, Waves } from '../components/Sketch.jsx'

const QUICK = [
  ['/students', 'quick.students', 'M9 8a3 3 0 1 0 0-.1M3 20c.7-3.6 3.2-5.5 6-5.5s5.3 1.9 6 5.5M17 9a2.4 2.4 0 1 0 0-.1M16.5 14.6c2.4.3 4 2 4.5 4.4'],
  ['/directory', 'quick.directory', 'M12 21s-7-6-7-11.5A7 7 0 0 1 19 9.5C19 15 12 21 12 21zM12 7.5a2.5 2.5 0 1 0 0 .1'],
  ['/heritage', 'quick.heritage', 'M3 20h18M5 20V10M19 20V10M3 10l9-6 9 6M9 20v-5h6v5'],
  ['/blog', 'quick.blog', 'M5 4h11l3 3v13H5zM8 10h8M8 14h8M8 17h5'],
  ['/gallery', 'quick.gallery', 'M3 6h18v13H3zM3 15l5-5 5 5 3-3 5 5M16 9.5a1 1 0 1 0 0-.1'],
]

function MapPanel({ u }) {
  const { t, n, pick } = useApp()
  if (!u) return null
  return (
    <div className="map-panel">
      <h3>{pick(u.nameBn, u.nameEn)}</h3>
      <dl className="mini-stats">
        <div><dt>{t('dir.members')}</dt><dd className="num">{n(u.members)}</dd></div>
        <div><dt>{t('dir.unions')}</dt><dd className="num">{n(u.unions.length)}</dd></div>
        <div><dt>{t('dir.places')}</dt><dd className="num">{n(u.places)}</dd></div>
      </dl>
      <Link className="btn btn-dark btn-sm" to={`/directory/${u.slug}`}>{t('dir.view')} →</Link>
    </div>
  )
}

export default function Home() {
  const { t, n, pick } = useApp()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState('sadar')
  const stats = useApi('/stats')
  const ups = useApi('/upazilas')
  const places = useApi('/heritage')
  const posts = useApi('/blog')
  const upazilas = ups.data?.items || []
  const placeList = places.data?.items || []
  const s = stats.data

  const submit = (e) => { e.preventDefault(); nav(`/students?q=${encodeURIComponent(q)}`) }

  return (
    <>
      <section className="hero">
        <Photo id="titas-sunset" eager className="hero-bg" sizes="100vw" alt="" />
        <div className="hero-shade" />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="pill-note">{t('hero.kicker')}</p>
            <h1>
              {t('hero.title1')}<br />{t('hero.title2')}<br /><em>{t('hero.title3')}</em>
            </h1>
            <p className="lede">{t('hero.lede')}</p>
            <form className="hero-search" onSubmit={submit} role="search">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hero.search')} aria-label={t('hero.search')} />
              <button className="btn btn-leaf" type="submit">{t('hero.searchBtn')}</button>
            </form>
            <dl className="hero-stats">
              {[['students', s?.students], ['batches', s?.batches], ['upazilas', s?.upazilas], ['places', s?.places]].map(([k, v]) => (
                <div key={k}><dt>{t(`stat.${k}`)}</dt><dd className="num">{v != null ? n(v) : '–'}</dd></div>
              ))}
            </dl>
          </div>
          <div className="hero-blob">
            <Photo id="arifail-01" eager shape="shape-blob" sketch sizes="(min-width: 900px) 32vw, 80vw" />
            <Leaves className="sketch hero-leaves" />
          </div>
        </div>
        <Wave from="var(--paper)" />
      </section>

      <section className="section wrap explore">
        <div className="explore-copy">
          <p className="kicker">{t('explore.kicker')}</p>
          <h2>{t('explore.title')}</h2>
          <p className="lede">{t('explore.lede')}</p>
          <MapPanel u={upazilas.find((u) => u.slug === sel)} />
          <Link className="link-arrow" to="/directory">{t('explore.cta')} →</Link>
          <Waves className="sketch waves" />
        </div>
        <UpazilaMap upazilas={upazilas} places={placeList} selected={sel} onSelect={setSel} onPin={(p) => nav(`/heritage/${p.slug}`)} />
      </section>

      <section className="section wrap">
        <div className="section-head">
          <h2>{t('quick.title')}</h2><p className="muted">{t('quick.lede')}</p>
        </div>
        <div className="quick">
          {QUICK.map(([to, k, d]) => (
            <Link key={to} to={to} className="quick-item">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
              <span>{t(k)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="feature-band">
        <Wave from="var(--paper)" flip />
        <div className="wrap feature-grid">
          <div className="feature-copy">
            <p className="kicker kicker-light">{t('heritage.kicker')}</p>
            <h2>{t('heritage.title')}</h2>
            <p>{t('heritage.lede')}</p>
            <Link className="btn btn-light" to="/heritage">{t('heritage.cta')} →</Link>
            <Monument className="sketch monument" />
          </div>
          <Photo id="bariura-bridge" shape="shape-a" sketch sizes="(min-width: 900px) 50vw, 90vw" />
        </div>
        <Wave from="var(--paper)" />
      </section>

      <section className="section wrap">
        <div className="section-head">
          <h2>{t('heritage.title').split(',')[0]}</h2>
          <Link className="link-arrow" to="/heritage">{t('common.viewAll')} →</Link>
        </div>
        <div className="cards-3">
          {placeList.slice(0, 3).map((p) => <PlaceCard key={p.slug} p={p} upazilas={upazilas} />)}
        </div>
      </section>

      <section className="section wrap community">
        <div>
          <p className="kicker">{t('students.kicker')}</p>
          <h2>{t('community.title')}</h2>
          <p className="lede">{t('community.body')}</p>
          <Link className="btn btn-dark" to="/students">{t('community.cta')} →</Link>
        </div>
        <figure className="quote-card">
          <StudentsSketch className="sketch students-sketch" />
          <blockquote>“{t('community.quote')}”</blockquote>
        </figure>
      </section>

      <section className="section wrap">
        <div className="section-head">
          <h2>{t('stories.title')}</h2><Link className="link-arrow" to="/blog">{t('stories.all')} →</Link>
        </div>
        <div className="cards-3">
          {(posts.data?.items || []).slice(0, 3).map((p) => <PostCard key={p.slug} p={p} />)}
        </div>
      </section>

      <section className="wrap section">
        <div className="join-band">
          <div>
            <h2>{t('join.title')}</h2>
            <p>{t('join.body')}</p>
          </div>
          <Link className="btn btn-leaf" to="/register">{t('join.cta')}</Link>
          <Badge tone="gold">{pick('শুধু ব্রাহ্মণবাড়িয়ার শিক্ষার্থী', 'Brahmanbaria students only')}</Badge>
        </div>
      </section>
    </>
  )
}
