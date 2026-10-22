import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import UpazilaMap from '../components/UpazilaMap.jsx'
import Icon from '../components/Icon.jsx'
import Reveal from '../components/Reveal.jsx'
import { Photo, Avatar } from '../components/ui.jsx'
import { PlaceCard, PostCard } from '../components/cards.jsx'

const QUICK = [
  ['/students', 'quick.students', 'quick.studentsD', 'users'],
  ['/directory', 'quick.directory', 'quick.directoryD', 'pin'],
  ['/heritage', 'quick.heritage', 'quick.heritageD', 'landmark'],
  ['/blog', 'quick.blog', 'quick.blogD', 'book'],
  ['/gallery', 'quick.gallery', 'quick.galleryD', 'image'],
]

// Themes of the district, each opening the page that really holds it.
const THEMES = [
  { id: 'arifail-01', bn: 'মসজিদ ও ইসলামী ঐতিহ্য', en: 'Mosques & Islamic heritage', to: '/heritage?category=mosque' },
  { id: 'titas-morning', bn: 'নদী ও প্রকৃতি', en: 'Rivers & natural beauty', to: '/heritage?category=river' },
  { id: 'boat-race', bn: 'নৌকাবাইচ ও লোকসংস্কৃতি', en: 'Boat racing & folk culture', to: '/gallery' },
  { id: 'bariura-bridge', bn: 'ঐতিহাসিক স্থান', en: 'Historical places', to: '/heritage?category=bridge' },
  { id: 'kullapathar', bn: 'স্মৃতিসৌধ ও মুক্তিযুদ্ধ', en: 'Memorials & the Liberation War', to: '/heritage?category=memorial' },
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
      <Link className="btn btn-outline btn-sm" to={`/directory/${u.slug}`}>{t('dir.view')} <Icon name="arrow" size={15} className="arr" /></Link>
    </div>
  )
}

export default function Home() {
  const { t, n, pick } = useApp()
  const { user } = useAuth()
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
  const unionCount = upazilas.reduce((sum, u) => sum + u.unions.length, 0)

  const submit = (e) => { e.preventDefault(); nav(`/students?q=${encodeURIComponent(q.trim())}`) }
  const joinTo = user ? (user.role === 'admin' ? '/admin' : '/dashboard') : '/register'

  return (
    <>
      {/* ---------- hero: the artwork sets the scene, the copy sits in its open sky ---------- */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-media" aria-hidden="true">
          <img src="/images/hero-art-1774.webp" srcSet="/images/hero-art-1000.webp 1000w, /images/hero-art-1774.webp 1774w" sizes="100vw" width="1774" height="512" alt="" fetchpriority="high" />
        </div>
        <div className="hero-shade" aria-hidden="true" />
        <div className="wrap hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">{pick('ইতিহাস · ঈমান · সংস্কৃতি · মানুষ', 'History · Faith · Culture · People')}</p>
            <h1 id="hero-title">{pick('ব্রাহ্মণবাড়িয়া', 'Brahmanbaria')}</h1>
            <p className="hero-sub">{pick('আমাদের ঐতিহ্য, আমাদের মানুষ, আরও উজ্জ্বল আগামী', 'Our heritage, our people, a brighter tomorrow')}</p>
            <p className="hero-lede">{pick('বিশ্ববিদ্যালয়-পড়ুয়াদের একটি কমিউনিটি, যারা জেলার ইসলামী ঐতিহ্য, সংস্কৃতি ও প্রকৃতিকে ধরে রাখে এবং একসাথে সুযোগ গড়ে তোলে।', 'A community of university students preserving the district’s Islamic heritage, culture and natural beauty, and building opportunities together.')}</p>
            <form className="hero-search" onSubmit={submit} role="search">
              <Icon name="search" size={18} className="hero-search-ico" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hero.search')} aria-label={t('hero.search')} />
              <button className="btn btn-dark" type="submit">{t('hero.searchBtn')}</button>
            </form>
            <div className="hero-links">
              <Link className="btn-text" to={joinTo}>{user ? t(user.role === 'admin' ? 'admin.title' : 'auth.account') : pick('কমিউনিটিতে যোগ দিন', 'Join the community')} <Icon name="arrow" size={15} className="arr" /></Link>
              <Link className="btn-text quiet" to="/heritage">{pick('ঐতিহ্য ঘুরে দেখুন', 'Explore heritage')}</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- real numbers, quietly ---------- */}
      <section className="wrap stats-strip" aria-label={pick('পরিসংখ্যান', 'At a glance')}>
        <dl>
          {[
            ['students', s?.students, 'শিক্ষার্থী', 'Students'],
            ['upazilas', s?.upazilas, 'উপজেলা', 'Upazilas'],
            ['unions', unionCount || undefined, 'ইউনিয়ন পরিষদ', 'Union parishads'],
            ['places', s?.places, 'ঐতিহাসিক স্থান', 'Historical places'],
          ].map(([k, v, bn, en]) => (
            <div key={k}><dt>{pick(bn, en)}</dt><dd className="num">{v != null ? n(v) : '–'}</dd></div>
          ))}
        </dl>
      </section>

      {/* ---------- themes of the district ---------- */}
      <section className="section wrap" aria-labelledby="themes-h">
        <Reveal className="section-head">
          <div>
            <p className="kicker">{pick('ঐতিহ্যের সূচি', 'A heritage index')}</p>
            <h2 id="themes-h">{pick('জেলাকে চিনুন বিষয় ধরে', 'Discover the district by theme')}</h2>
          </div>
          <Link className="link-arrow" to="/heritage">{t('common.viewAll')} <Icon name="arrow" size={15} className="arr" /></Link>
        </Reveal>
        <div className="themes">
          {THEMES.map((th, i) => (
            <Reveal key={th.id} delay={i * 60} className={`theme t${i + 1}`}>
              <Link className="theme-card" to={th.to}>
                <Photo id={th.id} sizes={i < 2 ? '(min-width: 900px) 55vw, 82vw' : '(min-width: 900px) 33vw, 82vw'} alt="" />
                <span className="theme-copy"><span>{pick(th.bn, th.en)}</span><Icon name="arrow" size={16} className="arr" /></span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- explore the site ---------- */}
      <section className="section wrap" aria-labelledby="quick-h">
        <Reveal className="section-head">
          <div><h2 id="quick-h">{t('quick.title')}</h2><p className="muted">{t('quick.lede')}</p></div>
        </Reveal>
        <Reveal className="quick">
          {QUICK.map(([to, k, d, ic]) => (
            <Link key={to} to={to} className="quick-item">
              <span className="quick-ico"><Icon name={ic} size={18} /></span>
              <b>{t(k)}</b>
              <small>{t(d)}</small>
              <Icon name="arrow" size={15} className="arr quick-arr" />
            </Link>
          ))}
        </Reveal>
      </section>

      {/* ---------- interactive map ---------- */}
      <section className="section-tint">
        <div className="section wrap explore">
          <Reveal className="explore-copy">
            <p className="kicker">{t('explore.kicker')}</p>
            <h2>{t('explore.title')}</h2>
            <p className="lede">{t('explore.lede')}</p>
            <MapPanel u={upazilas.find((u) => u.slug === sel)} />
            <Link className="link-arrow" to="/directory">{t('explore.cta')} <Icon name="arrow" size={15} className="arr" /></Link>
          </Reveal>
          <Reveal delay={80}>
            <UpazilaMap upazilas={upazilas} places={placeList} selected={sel} onSelect={setSel} onPin={(p) => nav(`/heritage/${p.slug}`)} />
          </Reveal>
        </div>
      </section>

      {/* ---------- history, culture and people ---------- */}
      <section className="section wrap story">
        <Reveal className="story-copy">
          <p className="kicker">{t('collage.kicker')}</p>
          <h2>{t('collage.title')}</h2>
          <p className="lede">{t('collage.body')}</p>
          <Link className="btn btn-dark" to="/about">{t('collage.cta')} <Icon name="arrow" size={16} className="arr" /></Link>
        </Reveal>
        <div className="story-media">
          <Reveal className="story-main"><Photo id="alinagar-fair" sizes="(min-width: 900px) 42vw, 92vw" /></Reveal>
          <Reveal className="story-side" delay={120}><Photo id="titas-boat" sizes="(min-width: 900px) 22vw, 50vw" /></Reveal>
          <p className="story-caption">{t('collage.script')}</p>
        </div>
      </section>

      {/* ---------- featured places ---------- */}
      <section className="section wrap" aria-labelledby="featured-h">
        <Reveal className="section-head">
          <h2 id="featured-h">{t('featured.title')}</h2>
          <Link className="link-arrow" to="/heritage">{t('common.viewAll')} <Icon name="arrow" size={15} className="arr" /></Link>
        </Reveal>
        <div className="cards-3">
          {placeList.slice(0, 3).map((p, i) => <Reveal key={p.slug} delay={i * 70}><PlaceCard p={p} upazilas={upazilas} /></Reveal>)}
        </div>
      </section>

      {/* ---------- student community ---------- */}
      <section className="section wrap">
        <Reveal className="community">
          <div className="community-copy">
            <h2>{t('community.title')}</h2>
            <p className="lede">{t('community.body')}</p>
            <div className="avatar-row">
              {(students.data?.items || []).map((st) => <Avatar key={st.id} name={st.name} size={40} />)}
            </div>
            <Link className="btn btn-dark" to="/students">{t('community.cta')} <Icon name="arrow" size={16} className="arr" /></Link>
          </div>
          <figure className="community-quote">
            <blockquote>{t('community.quote')}</blockquote>
            <img src="/art/students.webp" alt="" loading="lazy" />
          </figure>
        </Reveal>
      </section>

      {/* ---------- stories ---------- */}
      <section className="section wrap" aria-labelledby="stories-h">
        <Reveal className="section-head">
          <div><h2 id="stories-h">{t('stories.title')}</h2><p className="muted">{t('stories.lede')}</p></div>
          <Link className="link-arrow" to="/blog">{t('stories.all')} <Icon name="arrow" size={15} className="arr" /></Link>
        </Reveal>
        <div className="cards-3">
          {(posts.data?.items || []).slice(0, 3).map((p, i) => <Reveal key={p.slug} delay={i * 70}><PostCard p={p} /></Reveal>)}
        </div>
      </section>

      <section className="wrap section">
        <Reveal className="join-band">
          <div>
            <h2>{t('join.title')}</h2>
            <p>{t('join.body')}</p>
          </div>
          <Link className="btn btn-light" to={joinTo}>{user ? t(user.role === 'admin' ? 'admin.title' : 'auth.account') : t('join.cta')} <Icon name="arrow" size={16} className="arr" /></Link>
          <span className="visually-hidden">{pick('শুধু ব্রাহ্মণবাড়িয়ার শিক্ষার্থী', 'Brahmanbaria students only')}</span>
        </Reveal>
      </section>
    </>
  )
}
