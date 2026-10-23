import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import Icon from '../components/Icon.jsx'
import Reveal from '../components/Reveal.jsx'
import { Avatar, Photo } from '../components/ui.jsx'
import { SketchArt, Vine } from '../components/Decor.jsx'
import UpazilaMap from '../components/UpazilaMap.jsx'
import { PlaceCard, PostCard } from '../components/cards.jsx'

// The three discovery cards of "Explore Brahmanbaria", each opening the page that holds it.
const DISCOVER = [
  { to: '/heritage', img: '/images/bariura-bridge-640.webp', bn: 'ঐতিহ্য ও নিদর্শন', en: 'Heritage & Landmarks', dbn: 'ঐতিহাসিক স্থান ও সাংস্কৃতিক নিদর্শন ঘুরে দেখুন।', den: 'Explore historic places and cultural landmarks.' },
  { to: '/heritage?category=mosque', img: '/images/bswa/mosque.webp', bn: 'ইসলামী সংস্কৃতি ও ঐতিহ্য', en: 'Islamic Culture & Traditions', dbn: 'বিশ্বাস, উৎসব ও স্থানীয় ঐতিহ্য জানুন।', den: 'Discover faith, festivals and local traditions.' },
  { to: '/heritage?category=river', img: '/images/bswa/river.webp', bn: 'নদী ও প্রকৃতি', en: 'Rivers & Nature', dbn: 'শান্ত নদী, প্রকৃতি ও মনোরম দৃশ্য।', den: 'Experience serene rivers, natural beauty and scenic landscapes.' },
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
  const joinTo = user ? (user.role === 'admin' ? '/admin' : '/dashboard') : '/register'
  const [sel, setSel] = useState('sadar')
  const stats = useApi('/stats')
  const ups = useApi('/upazilas')
  const places = useApi('/heritage')
  const posts = useApi('/blog')
  const students = useApi('/students?limit=6')
  const upazilas = ups.data?.items || []
  const placeList = places.data?.items || []
  const s = stats.data
  const unionCount = upazilas.reduce((sum, u) => sum + u.unions.length, 0)


  return (
    <>
      {/* ---------- hero: the supplied artwork exactly as designed. Its lettering and buttons are part of the picture, so the
           heading is given to screen readers and real links sit exactly over the drawn buttons (below it on phones). ---------- */}
      <section className="hero hero-full hero-exact" aria-labelledby="hero-title">
        <div className="hx">
          <img className="hx-img" src="/images/bswa/hero-4k-2400.webp" srcSet="/images/bswa/hero-4k-960.webp 960w, /images/bswa/hero-4k-1600.webp 1600w, /images/bswa/hero-4k-2400.webp 2400w, /images/bswa/hero-4k-3798.webp 3798w" sizes="100vw"
            width="3798" height="1676" alt="" fetchpriority="high" decoding="async" />
          <h1 id="hero-title" className="sr-only">{pick('ব্রাহ্মণবাড়িয়া — আমাদের ঐতিহ্য, আমাদের মানুষ, আমাদের আগামী। ঐতিহ্য, সংস্কৃতি ও মানুষের বন্ধনে।', 'Brahmanbaria — Our Heritage. Our People. Our Tomorrow.')}</h1>
          {/* the small lines of the artwork are real text, so they stay sharp at any size (the heading above is for screen readers) */}
          <p className="hx-eyebrow" aria-hidden="true">People · Heritage · Culture · Opportunity</p>
          <div className="hx-tag" aria-hidden="true">
            <span className="hx-tag-en">Our Heritage. Our People. Our Tomorrow.</span>
            <span className="hx-tag-bn" lang="bn">ঐতিহ্য, সংস্কৃতি ও মানুষের বন্ধনে</span>
          </div>
          {/* crisp, real buttons laid exactly over the ones drawn in the artwork, so they stay sharp at any size */}
          <Link className="hx-hit hx-explore" to="/heritage">{pick('ব্রাহ্মণবাড়িয়া ঘুরে দেখুন', 'Explore Brahmanbaria')} <Icon name="arrow" size={16} className="arr" /></Link>
          <Link className="hx-hit hx-meet" to="/students">{pick('আমাদের শিক্ষার্থীদের দেখুন', 'Meet Our Students')}</Link>
        </div>
        <div className="wrap hx-actions">
          <Link className="btn btn-dark" to="/heritage">{pick('ব্রাহ্মণবাড়িয়া ঘুরে দেখুন', 'Explore Brahmanbaria')} <Icon name="arrow" size={16} className="arr" /></Link>
          <Link className="btn btn-outline" to="/students">{pick('আমাদের শিক্ষার্থীদের দেখুন', 'Meet Our Students')}</Link>
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

      {/* ---------- explore Brahmanbaria: scenic image, three discovery cards and the nine upazilas ---------- */}
      <section className="explore2" aria-labelledby="explore-h">
        <div className="explore2-grid">
          <Reveal className="ex-media ex-exact">
            {/* the supplied artwork as designed: photograph, brushed edge, sprigs and the lettering are one picture */}
            <img data-parallax="0.06" src="/images/bswa/explore-mockup.webp" width="1878" height="1196" loading="lazy" decoding="async"
              alt={pick('তিতাসের তীরে সূর্যাস্ত, মসজিদ ও নৌকা — নদী, ঐতিহ্য, মানুষ', 'Sunset on the river with a mosque and boats — rivers, heritage, people')} />
          </Reveal>
          <div className="ex-copy">
            <Reveal>
              <p className="eyebrow">{pick('অনেক গল্পের একটি জেলা', 'A district of many stories')}</p>
              <h2 id="explore-h" className="ex-title">{pick('ঘুরে দেখুন ', 'Explore ')}<span className="hl">{pick('ব্রাহ্মণবাড়িয়া', 'Brahmanbaria')}</span></h2>
              <p className="lede">{pick('সমৃদ্ধ ইতিহাস, প্রাণবন্ত সংস্কৃতি, শান্ত নদী আর অনুপ্রেরণাদায়ী মানুষের জেলা। নয়টি উপজেলা জুড়ে এর ঐতিহ্য, প্রথা ও মানুষকে জানুন।', 'A land of rich history, vibrant culture, serene rivers and inspiring people. Discover its heritage, traditions and communities across nine upazilas.')}</p>
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
            <Reveal className="ex-ups">
              <p className="ex-label">{pick('নয়টি উপজেলা', 'The nine upazilas')}</p>
              <div className="ex-ups-row">
              <ul>
                {[...upazilas].sort((x, y) => (x.slug === 'sadar' ? -1 : y.slug === 'sadar' ? 1 : 0)).map((u) => (
                  <li key={u.slug}><Link to={`/directory/${u.slug}`}><Icon name="pin" size={15} /><span>{pick(u.nameBn, u.nameEn).replace(' উপজেলা', '').replace(' Upazila', '')}</span><Icon name="arrow" size={13} className="arr" /></Link></li>
                ))}
              </ul>
              <div className="ex-side">
                <span className="ex-sun" aria-hidden="true" />
                <SketchArt src="river" className="ex-sketch" />
                <Link className="btn btn-dark ex-all" to="/directory">{pick('সব উপজেলা দেখুন', 'Explore all upazilas')} <Icon name="arrow" size={16} className="arr" /></Link>
              </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------- interactive upazila map (real boundaries and counts) ---------- */}
      <section className="section-tint map-sec">
        <Vine className="vine-map" />
        <div className="section wrap explore">
          <Reveal className="explore-copy">
            <p className="eyebrow">{t('explore.kicker')}</p>
            <h2>{t('explore.title')}</h2>
            <p className="lede">{t('explore.lede')}</p>
            <MapPanel u={upazilas.find((u) => u.slug === sel)} />
            <Link className="link-arrow" to="/directory">{t('explore.cta')} <Icon name="arrow" size={15} className="arr" /></Link>
          </Reveal>
          <Reveal delay={80}>
            <UpazilaMap upazilas={upazilas} places={placeList} selected={sel} onSelect={setSel} onPin={(pl) => nav(`/heritage/${pl.slug}`)} />
          </Reveal>
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

      {/* ---------- student community: real community photograph beside an evergreen panel ---------- */}
      <section className="cband" aria-labelledby="cband-h">
        <div className="cband-photo">
          <Photo id="boat-race" sizes="(min-width: 1000px) 50vw, 100vw" alt={pick('নৌকাবাইচ দেখতে নদীর তীরে মানুষের ভিড়', 'People gathered on the riverbank for a boat race')} />
          <p className="cband-script" aria-hidden="true">{pick('ভিন্ন পথ, একসাথে আগামী', 'Different journeys, a stronger tomorrow')}</p>
        </div>
        <div className="cband-copy">
          <SketchArt src="heritage" className="cb-heritage" />
          <SketchArt src="students" className="cb-students" />
          <Reveal>
            <p className="eyebrow eyebrow-line">{pick('শিক্ষার্থী কমিউনিটি', 'Student community')}</p>
            <h2 id="cband-h">{pick('যারা গড়ছে আগামী', 'The people shaping tomorrow')}</h2>
            <p className="cband-lede">{t('community.body')}</p>
            {(students.data?.items || []).length > 0 && (
              <div className="cband-avatars">
                {(students.data?.items || []).map((st) => <Avatar key={st.id} name={st.name} photo={st.details?.photoUrl} size={42} />)}
                <Link to="/students" className="cband-more" aria-label={t('community.cta')}>+</Link>
              </div>
            )}
            <div className="cband-actions">
              <Link className="btn btn-dark" to="/students">{t('community.cta')} <Icon name="arrow" size={16} className="arr" /></Link>
              <Link className="btn btn-on-dark" to={joinTo}>{user ? t(user.role === 'admin' ? 'admin.title' : 'auth.account') : pick('BSWA-তে যোগ দিন', 'Join BSWA')}</Link>
            </div>
            <p className="cband-sign" aria-hidden="true">{pick('একই শিকড়, উজ্জ্বল পথ', 'Same roots, brighter paths')}</p>
          </Reveal>
        </div>
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

    </>
  )
}
