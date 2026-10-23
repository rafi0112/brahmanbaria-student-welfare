import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import UpazilaMap from '../components/UpazilaMap.jsx'
import Icon from '../components/Icon.jsx'
import Reveal from '../components/Reveal.jsx'
import { Avatar } from '../components/ui.jsx'
import { PlaceCard, PostCard } from '../components/cards.jsx'

const QUICK = [
  ['/students', 'quick.students', 'quick.studentsD', 'users'],
  ['/directory', 'quick.directory', 'quick.directoryD', 'pin'],
  ['/heritage', 'quick.heritage', 'quick.heritageD', 'landmark'],
  ['/blog', 'quick.blog', 'quick.blogD', 'book'],
  ['/gallery', 'quick.gallery', 'quick.galleryD', 'image'],
]

// The cultural pillars of the district, each opening the page that really holds it.
const CULTURE = [
  { img: 'mosque', w: 530, h: 500, bn: 'ইসলামী ঐতিহ্য', en: 'Islamic Heritage', sbn: 'মসজিদ ও স্থাপত্য', sen: 'Mosques & architecture', to: '/heritage?category=mosque' },
  { img: 'baul', w: 382, h: 400, bn: 'বাউল ও লোকসংস্কৃতি', en: 'Baul & Folk Culture', sbn: 'গান, গল্প ও যন্ত্র', sen: 'Music, stories & instruments', to: '/gallery' },
  { img: 'puppets', w: 395, h: 512, bn: 'পুতুল নাচ', en: 'Putul Nach', sbn: 'ঐতিহ্যবাহী পুতুল নাচ', sen: 'Traditional puppet dance', to: '/gallery' },
  { img: 'river', w: 740, h: 421, bn: 'নদী ও প্রকৃতি', en: 'Rivers & Nature', sbn: 'তিতাস, মেঘনা ও আরও', sen: 'The Titas, the Meghna and more', to: '/heritage?category=river' },
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
      {/* ---------- hero: copy on the cream canvas, the river-and-mosque artwork beside it ---------- */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">{pick('ব্রাহ্মণবাড়িয়া · বাংলাদেশ', 'Brahmanbaria · Bangladesh')}</p>
            <h1 id="hero-title">
              <span>{pick('আমাদের ঐতিহ্য।', 'Our Heritage.')}</span>{' '}
              <span>{pick('আমাদের মানুষ।', 'Our People.')}</span>{' '}
              <span className="hl">{pick('আমাদের আগামী।', 'Our Tomorrow.')}</span>
            </h1>
            <p className="hero-lede">{pick('ব্রাহ্মণবাড়িয়ার শিক্ষার্থীদের একটি কমিউনিটি, যারা জেলার ইসলামী ঐতিহ্য, বাউল সংগীত, পুতুল নাচ ও নদীর সৌন্দর্যকে ধরে রাখে এবং একসাথে সুযোগ গড়ে তোলে।', 'A community of Brahmanbaria’s students, preserving the district’s Islamic heritage, Baul music, Putul Nach and river landscapes, and building opportunities together.')}</p>
            <div className="hero-actions">
              <Link className="btn btn-dark" to="/heritage">{pick('ব্রাহ্মণবাড়িয়া ঘুরে দেখুন', 'Explore Brahmanbaria')} <Icon name="arrow" size={16} className="arr" /></Link>
              <Link className="btn btn-outline" to={joinTo}>{user ? t(user.role === 'admin' ? 'admin.title' : 'auth.account') : pick('কমিউনিটিতে যোগ দিন', 'Join the community')}</Link>
            </div>
            <form className="hero-search" onSubmit={submit} role="search">
              <Icon name="search" size={18} className="hero-search-ico" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hero.search')} aria-label={t('hero.search')} />
              <button className="btn btn-sm btn-outline" type="submit">{t('hero.searchBtn')}</button>
            </form>
          </div>
          <div className="hero-media">
            <img src="/images/bswa/hero-1672.webp" srcSet="/images/bswa/hero-640.webp 640w, /images/bswa/hero-1000.webp 1000w, /images/bswa/hero-1672.webp 1672w" sizes="(min-width: 1000px) 58vw, 100vw" width="1672" height="941" alt={pick('সূর্যাস্তের নদী, মসজিদ ও একজন বাউল শিল্পী', 'A river at sunset, a mosque and a Baul musician')} fetchpriority="high" />
          </div>
        </div>
        <div className="wrap hero-foot">
          <dl className="stats-strip-inline" aria-label={pick('পরিসংখ্যান', 'At a glance')}>
            {[
              ['students', s?.students, 'users', 'শিক্ষার্থী', 'Students'],
              ['upazilas', s?.upazilas, 'pin', 'উপজেলা', 'Upazilas'],
              ['unions', unionCount || undefined, 'landmark', 'ইউনিয়ন পরিষদ', 'Union parishads'],
              ['places', s?.places, 'book', 'ঐতিহাসিক স্থান', 'Historical places'],
            ].map(([k, v, ic, bn, en]) => (
              <div key={k}><span className="stat-ico" aria-hidden="true"><Icon name={ic} size={20} /></span><dt>{pick(bn, en)}</dt><dd className="num">{v != null ? n(v) : '–'}</dd></div>
            ))}
          </dl>
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
          <Reveal className="story-main"><div className="photo shape-r"><img src="/images/bswa/river.webp" alt={pick('নদীর তীরে সূর্যাস্ত', 'Sunset on the river')} width="740" height="421" loading="lazy" decoding="async" /></div></Reveal>
          <Reveal className="story-side" delay={120}><div className="photo shape-r"><img src="/images/bswa/mosque.webp" alt={pick('মসজিদ ও গাছপালা', 'A mosque among the trees')} width="530" height="500" loading="lazy" decoding="async" /></div></Reveal>
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

      {/* ---------- stories (only real, published articles; placeholders are never public) ---------- */}
      {(posts.data?.items || []).length > 0 && (
      <section className="section wrap" aria-labelledby="stories-h">
        <Reveal className="section-head">
          <div><h2 id="stories-h">{t('stories.title')}</h2><p className="muted">{t('stories.lede')}</p></div>
          <Link className="link-arrow" to="/blog">{t('stories.all')} <Icon name="arrow" size={15} className="arr" /></Link>
        </Reveal>
        <div className="cards-3">
          {(posts.data?.items || []).slice(0, 3).map((p, i) => <Reveal key={p.slug} delay={i * 70}><PostCard p={p} /></Reveal>)}
        </div>
      </section>
      )}

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
