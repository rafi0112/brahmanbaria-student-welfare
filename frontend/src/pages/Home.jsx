import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import UpazilaMap from '../components/UpazilaMap.jsx'
import Icon from '../components/Icon.jsx'
import { Photo, Avatar } from '../components/ui.jsx'
import { PlaceCard, PostCard } from '../components/cards.jsx'

const QUICK = [
  ['/students', 'quick.students', 'quick.studentsD', 'users'],
  ['/directory', 'quick.directory', 'quick.directoryD', 'pin'],
  ['/heritage', 'quick.heritage', 'quick.heritageD', 'landmark'],
  ['/blog', 'quick.blog', 'quick.blogD', 'book'],
  ['/gallery', 'quick.gallery', 'quick.galleryD', 'image'],
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
  const students = useApi('/students?limit=5')
  const upazilas = ups.data?.items || []
  const placeList = places.data?.items || []
  const s = stats.data

  const submit = (e) => { e.preventDefault(); nav(`/students?q=${encodeURIComponent(q)}`) }

  return (
    <>
      {/* ---------- hero ---------- */}
      <section className="hero">
        <Photo id="boat-race" eager className="hero-bg" sizes="100vw" alt="" />
        <div className="hero-shade" />
        <img className="hero-leaf hero-leaf-r" src="/art/tree-tr.webp" alt="" />
        <img className="hero-leaf hero-leaf-l" src="/art/vine-tl.webp" alt="" />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1>
              {t('hero.title1')}<br />{t('hero.title2')}<br /><em>{t('hero.title3')}</em>
            </h1>
            <p className="lede">{t('hero.lede')}</p>
            <form className="hero-search" onSubmit={submit} role="search">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hero.search')} aria-label={t('hero.search')} />
              <button className="search-go" type="submit" aria-label={t('hero.searchBtn')}><Icon name="search" size={18} /></button>
            </form>
            <dl className="hero-stats">
              {[['students', s?.students, 'users'], ['upazilas', s?.upazilas, 'pin'], ['batches', s?.batches, 'grad'], ['places', s?.places, 'landmark']].map(([k, v, ic]) => (
                <div key={k}><span className="stat-ico"><Icon name={ic} size={18} /></span><span><dd className="num">{v != null ? n(v) : '–'}</dd><dt>{t(`stat.${k}`)}</dt></span></div>
              ))}
            </dl>
          </div>
          <div className="hero-side">
            <p className="script-note">{t('hero.script')}</p>
            <div className="hero-blob">
              <Photo id="arifail-01" eager shape="shape-blob" sizes="(min-width: 900px) 32vw, 80vw" />
              <Link to="/heritage" className="blob-go" aria-label={t('heritage.cta')}><Icon name="arrow" size={20} /></Link>
            </div>
          </div>
        </div>
        <svg className="hero-edge" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 120V60C120 20 230 12 360 40c150 32 250 62 430 40 170-20 250-70 420-62 90 4 170 20 230 42v60z" />
        </svg>
      </section>

      {/* ---------- explore our district ---------- */}
      <section className="section wrap">
        <div className="section-head left">
          <div><h2>{t('quick.title')}</h2><p className="muted">{t('quick.lede')}</p></div>
        </div>
        <div className="quick">
          {QUICK.map(([to, k, d, ic]) => (
            <Link key={to} to={to} className="quick-item">
              <span className="ico-circle"><Icon name={ic} size={20} /></span>
              <b>{t(k)}</b>
              <small>{t(d)}</small>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- interactive map ---------- */}
      <section className="section wrap explore">
        <div className="explore-copy">
          <p className="kicker">{t('explore.kicker')}</p>
          <h2>{t('explore.title')}</h2>
          <p className="lede">{t('explore.lede')}</p>
          <MapPanel u={upazilas.find((u) => u.slug === sel)} />
          <Link className="link-arrow" to="/directory">{t('explore.cta')} →</Link>
        </div>
        <UpazilaMap upazilas={upazilas} places={placeList} selected={sel} onSelect={setSel} onPin={(p) => nav(`/heritage/${p.slug}`)} />
      </section>

      {/* ---------- history, culture and people (photo collage) ---------- */}
      <section className="section wrap collage-sec">
        <div className="collage-copy">
          <p className="kicker">{t('collage.kicker')}</p>
          <h2>{t('collage.title')}</h2>
          <p className="lede">{t('collage.body')}</p>
          <Link className="btn btn-dark" to="/about">{t('collage.cta')} →</Link>
        </div>
        <div className="collage" aria-hidden="false">
          <span className="paper-patch p1" aria-hidden="true" />
          <span className="paper-patch p2" aria-hidden="true" />
          <div className="c-main"><Photo id="arifail-01" shape="shape-r" sizes="(min-width: 900px) 40vw, 90vw" /></div>
          <div className="c-left"><Photo id="titas-boat" shape="shape-r" sizes="(min-width: 900px) 20vw, 50vw" /></div>
          <div className="c-right"><Photo id="akhaura-water" shape="shape-r" sizes="(min-width: 900px) 16vw, 40vw" /></div>
          <img className="c-river" src="/art/river.webp" alt="" loading="lazy" />
          <p className="script-note dark">{t('collage.script')}</p>
        </div>
      </section>

      {/* ---------- featured places ---------- */}
      <section className="section wrap">
        <div className="section-head">
          <h2>{t('featured.title')}</h2>
          <Link className="link-arrow" to="/heritage">{t('common.viewAll')} →</Link>
        </div>
        <div className="cards-3">
          {placeList.slice(0, 3).map((p) => <PlaceCard key={p.slug} p={p} upazilas={upazilas} />)}
        </div>
      </section>

      {/* ---------- student community ---------- */}
      <section className="section wrap community">
        <div className="community-copy">
          <h2>{t('community.title')}</h2>
          <p className="lede">{t('community.body')}</p>
          <div className="avatar-row">
            {(students.data?.items || []).map((st) => <Avatar key={st.id} name={st.name} size={44} />)}
          </div>
          <Link className="btn btn-dark" to="/students">{t('community.cta')} →</Link>
        </div>
        <figure className="community-art">
          <blockquote>“{t('community.quote')}”</blockquote>
          <img src="/art/students.webp" alt="" loading="lazy" />
          <img className="art-heritage" src="/art/heritage.webp" alt="" loading="lazy" />
        </figure>
      </section>

      {/* ---------- stories ---------- */}
      <section className="section wrap">
        <div className="section-head">
          <div><h2>{t('stories.title')}</h2><p className="muted">{t('stories.lede')}</p></div>
          <Link className="link-arrow" to="/blog">{t('stories.all')} →</Link>
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
          <img className="join-art" src="/art/leaves-bl.webp" alt="" loading="lazy" />
          <span className="visually-hidden">{pick('শুধু ব্রাহ্মণবাড়িয়ার শিক্ষার্থী', 'Brahmanbaria students only')}</span>
        </div>
      </section>
    </>
  )
}
