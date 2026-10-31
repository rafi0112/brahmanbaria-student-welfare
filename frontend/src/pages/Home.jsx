import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import Icon from '../components/Icon.jsx'
import Reveal from '../components/Reveal.jsx'
import { Avatar, Photo } from '../components/ui.jsx'
import { SketchArt, Vine } from '../components/Decor.jsx'
import UpazilaMap from '../components/UpazilaMap.jsx'
import { PostCard } from '../components/cards.jsx'
import EventCarousel from '../components/EventCarousel.jsx'
import HeroStage from '../components/HeroStage.jsx'

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

// One number that counts up from zero once `go` turns true (eased, about 1.6 s), in the page's numerals.
function CountUp({ value, go, delay = 0 }) {
  const { n } = useApp()
  const [v, setV] = useState(0)
  useEffect(() => {
    if (value == null || !go) return undefined
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(value); return undefined }
    let raf = 0
    let start = 0
    const tick = (now) => {
      if (!start) start = now + delay
      const p = Math.min(1, Math.max(0, (now - start) / 1600))
      setV(Math.round(value * (1 - Math.pow(2, -10 * p))))
      if (p < 1) raf = requestAnimationFrame(tick)
      else setV(value)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, go, delay])
  return value == null ? '–' : n(v)
}

// The four headline numbers on a cream band. They start counting, and their lines fill, when the band scrolls into view.
function StatsBand({ items }) {
  const { pick } = useApp()
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <section className={`stat-band${seen ? ' is-in' : ''}`} ref={ref} aria-labelledby="stat-h">
      <div className="wrap stat-band-in">
        <div className="stat-head">
          <p className="eyebrow">{pick('এক নজরে', 'At a glance')}</p>
          <h2 id="stat-h">{pick('সংখ্যায় আমাদের জেলা ও কমিউনিটি', 'Our district and community in numbers')}</h2>
        </div>
        <dl className="stat-grid">
          {items.map(([k, v, ic, bn, en, subBn, subEn], i) => (
            <div key={k} className="stat" style={{ '--i': i }}>
              <span className="stat-ico" aria-hidden="true"><Icon name={ic} size={20} /></span>
              <dd className="num"><CountUp value={v} go={seen} delay={i * 120} /></dd>
              <dt>{pick(bn, en)}<small>{pick(subBn, subEn)}</small></dt>
              <span className="stat-line" aria-hidden="true"><i /></span>
            </div>
          ))}
        </dl>
      </div>
    </section>
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
  const events = useApi('/events')
  // upcoming events first (soonest first), then the most recent past ones
  const today = new Date().toISOString().slice(0, 10)
  const evAll = [...(events.data?.items || [])].sort((a, b) => a.date.localeCompare(b.date))
  const eventList = [...evAll.filter((e) => e.date >= today), ...evAll.filter((e) => e.date < today).reverse()]
  const students = useApi('/students?limit=6')
  const upazilas = ups.data?.items || []
  const placeList = places.data?.items || []
  const s = stats.data
  const unionCount = upazilas.reduce((sum, u) => sum + u.unions.length, 0)


  return (
    <>
      {/* ---------- hero: the four-scene cinematic stage (HeroStage), then the live numbers ---------- */}
      <section className="hero hero-stage" aria-labelledby="hero-title">
        <HeroStage />
      </section>

      {/* ---------- events: a carousel that moves on its own, from the published events in the database ---------- */}
      <section className="section wrap" aria-labelledby="events-h">
        <Reveal className="section-head">
          <div>
            <p className="eyebrow">{pick('ইভেন্ট ও আয়োজন', 'Events')}</p>
            <h2 id="events-h">{pick('আসন্ন ও সাম্প্রতিক ইভেন্ট', 'Upcoming and recent events')}</h2>
          </div>
          <Link className="link-arrow" to="/events">{pick('সব ইভেন্ট', 'All events')} <Icon name="arrow" size={15} className="arr" /></Link>
        </Reveal>
        <EventCarousel items={eventList} loading={events.loading} />
      </section>

      {/* ---------- explore Brahmanbaria: scenic image and the nine upazilas (the discovery and culture cards live on the heritage page) ---------- */}
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
            </Reveal>
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

      {/* ---------- the district and the community in numbers: counts rise as the band comes into view ---------- */}
      <StatsBand items={[
        ['students', s ? (s.students || 0) + (s.alumni || 0) : undefined, 'users', 'শিক্ষার্থী ও অ্যালামনাই', 'Students and alumni',
          s ? `বর্তমান ${n(s.students || 0)} · অ্যালামনাই ${n(s.alumni || 0)}` : '', s ? `${s.students || 0} current · ${s.alumni || 0} alumni` : ''],
        ['upazilas', s?.upazilas, 'pin', 'উপজেলা', 'Upazilas', 'ব্রাহ্মণবাড়িয়া জেলায়', 'in Brahmanbaria'],
        ['unions', unionCount || undefined, 'landmark', 'ইউনিয়ন পরিষদ', 'Union parishads', 'নয়টি উপজেলা জুড়ে', 'across the nine upazilas'],
        ['places', s?.places, 'book', 'ঐতিহাসিক স্থান', 'Historical places', 'সূত্রসহ সংরক্ষিত', 'documented with sources'],
      ]} />

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
                {(students.data?.items || []).map((st) => <Avatar key={st.id} name={st.name} photo={st.photo || st.details?.photoUrl} size={42} />)}
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
