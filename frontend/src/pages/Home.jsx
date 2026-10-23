import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import Icon from '../components/Icon.jsx'
import Reveal from '../components/Reveal.jsx'
import { Avatar, Photo } from '../components/ui.jsx'
import { Sprig, SketchArt } from '../components/Decor.jsx'
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

export default function Home() {
  const { t, n, pick } = useApp()
  const { user } = useAuth()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const stats = useApi('/stats')
  const ups = useApi('/upazilas')
  const places = useApi('/heritage')
  const posts = useApi('/blog')
  const students = useApi('/students?limit=6')
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
          <div className="hero-media-wrap">
          <div className="hero-media blob-a">
            <img src="/images/bswa/hero-1672.webp" srcSet="/images/bswa/hero-640.webp 640w, /images/bswa/hero-1000.webp 1000w, /images/bswa/hero-1672.webp 1672w" sizes="(min-width: 1000px) 58vw, 100vw" width="1672" height="941" alt={pick('সূর্যাস্তের নদী, মসজিদ ও একজন বাউল শিল্পী', 'A river at sunset, a mosque and a Baul musician')} fetchpriority="high" />
          </div>
            <Sprig src="vine-tl" className="sprig-hero-tr" />
            <Sprig src="leaves-bl" className="sprig-hero-bl" />
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

      {/* ---------- explore Brahmanbaria: scenic image, three discovery cards and the nine upazilas ---------- */}
      <section className="explore2" aria-labelledby="explore-h">
        <SketchArt src="river" className="ex-river" />
        <div className="wrap explore2-grid">
          <Reveal className="ex-media">
            <div className="ex-img blob-b">
              <img src="/images/bswa/hero-1672.webp" srcSet="/images/bswa/hero-1000.webp 1000w, /images/bswa/hero-1672.webp 1672w" sizes="(min-width: 1000px) 46vw, 100vw" width="1672" height="941" alt={pick('তিতাসের তীরে সূর্যাস্ত ও মসজিদ', 'Sunset over the river with a mosque on the bank')} loading="lazy" decoding="async" />
              <span className="ex-shade" aria-hidden="true" />
              <p className="ex-script" aria-hidden="true"><span>{pick('ব্রাহ্মণবাড়িয়া', 'Brahmanbaria')}</span><small>{pick('নদী · ঐতিহ্য · মানুষ', 'Rivers · Heritage · People')}</small><small>{pick('আরও উজ্জ্বল আগামী', 'A brighter tomorrow')}</small></p>
            </div>
            <Sprig src="sprig" className="sprig-ex-tr" />
            <Sprig src="leaves-bl" className="sprig-ex-br" />
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
              <ul>
                {upazilas.map((u) => (
                  <li key={u.slug}><Link to={`/directory/${u.slug}`}><Icon name="pin" size={15} /><span>{pick(u.nameBn, u.nameEn).replace(' উপজেলা', '').replace(' Upazila', '')}</span><Icon name="arrow" size={13} className="arr" /></Link></li>
                ))}
              </ul>
              <Link className="btn btn-dark ex-all" to="/directory">{pick('সব উপজেলা দেখুন', 'Explore all upazilas')} <Icon name="arrow" size={16} className="arr" /></Link>
            </Reveal>
          </div>
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
                {(students.data?.items || []).map((st) => <Avatar key={st.id} name={st.name} size={42} />)}
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
