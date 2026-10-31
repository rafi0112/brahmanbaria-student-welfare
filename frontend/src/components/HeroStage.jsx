import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import images from '../data/images.json'
import { useApp } from '../lib/app.jsx'

const SCENE_MS = 8000

// The four chapters. Captions name the place or subject only: people in the pictures are not presented as members of
// the association. `wm` is the faint chapter word set into the picture, `pos` frames the photograph and `boost` adds
// shade where the photograph is bright behind the type.
const SCENES = [
  { id: 'dragon-boat', no: '01', bn: 'নৌকাবাইচ · আমাদের ঐতিহ্য', en: 'Boat race · Our heritage', wm: 'বাইচ', pos: '46% 40%', boost: 0 },
  { id: 'jnu-main', no: '02', bn: 'জগন্নাথ বিশ্ববিদ্যালয় · শিক্ষার্থী সমাজ', en: 'Jagannath University · Student community', wm: 'শিক্ষা', pos: '50% 35%', boost: 0.5 },
  { id: 'arifail-01', no: '03', bn: 'আড়িফাইল মসজিদ, সরাইল · ইসলামি ঐতিহ্য', en: 'Arifail Mosque, Sarail · Islamic heritage', wm: 'স্থাপত্য', pos: '50% 30%', boost: 0.85 },
  { id: 'folk-culture', no: '04', bn: 'বাউল গান ও পুতুল নাচ · আমাদের সংস্কৃতি', en: 'Baul song and puppet theatre · Our culture', wm: 'লোকজ', pos: '55% 35%', boost: 0.5 },
]

const src = (id) => ({ src: `/images/${id}-1280.webp`, srcSet: `/images/${id}-640.webp 640w, /images/${id}-1280.webp 1280w${images[id]?.wide ? `, /images/${id}-1920.webp 1920w` : ''}` })

const Arrow = ({ d = 'M5 12h14M13 6l6 6-6 6', size = 18, width = 2.2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)

// The home hero: the photograph fills the screen (behind the clear header too). Each change opens the new picture through
// six shutter slats with one warm light sweep, then a slow push-in; a faint grain and the chapter word sit over it.
// The name and actions sit low on the left, the chapter dock low on the right. Autoplay pauses while the dock is hovered
// or focused, when the stage is off-screen or the tab hidden, or with the pause button, and never runs with reduced motion.
export default function HeroStage() {
  const { pick, n } = useApp()
  const [i, setI] = useState(0)
  const [prev, setPrev] = useState(null)
  const [held, setHeld] = useState(false)
  const [paused, setPaused] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [inView, setInView] = useState(true)
  const [reduce] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const stage = useRef(null)
  const go = useCallback((k) => setI((cur) => { const next = ((k % SCENES.length) + SCENES.length) % SCENES.length; if (next !== cur) setPrev(cur); return next }), [])

  useEffect(() => {
    const v = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', v)
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 })
    if (stage.current) io.observe(stage.current)
    return () => { document.removeEventListener('visibilitychange', v); io.disconnect() }
  }, [])
  const running = !reduce && !paused && !held && !hidden && inView
  useEffect(() => {
    if (!running) return undefined
    const id = setTimeout(() => go(i + 1), SCENE_MS)
    return () => clearTimeout(id)
  }, [running, i, go])
  useEffect(() => { // scrolling away: --sp runs 0 → 1 over the stage's height
    if (reduce) return undefined
    let raf = 0
    const on = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => { const el = stage.current; if (el) el.style.setProperty('--sp', Math.min(1, window.scrollY / el.offsetHeight).toFixed(3)) })
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => { window.removeEventListener('scroll', on); cancelAnimationFrame(raf) }
  }, [reduce])

  const s = SCENES[i]

  return (
    <div className={`hs${running ? ' is-running' : ''}`} ref={stage} style={{ '--boost': s.boost }}
      onKeyDown={(e) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1) }}>

      <div className="hs-stage" aria-hidden="true">
        {SCENES.map((sc, k) => (
          <div key={sc.id} className={`hs-fr${k === i ? ' is-on' : k === prev ? ' is-prev' : ''}`}>
            <img {...src(sc.id)} sizes="100vw" alt="" decoding="async" fetchpriority={k === 0 ? 'high' : undefined} style={{ objectPosition: sc.pos }} />
          </div>
        ))}
        <div className="hs-shade" /><div className="hs-boost" />
        <svg className="hs-grain"><filter id="hs-grain-f"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch" /></filter><rect width="100%" height="100%" filter="url(#hs-grain-f)" /></svg>
        {SCENES.map((sc, k) => <p key={sc.id} className={`hs-wm${k === i ? ' is-on' : ''}`} lang="bn">{sc.wm}</p>)}
      </div>
      <p className="sr-only" aria-live="polite">{pick(s.bn, s.en)}</p>

      <div className="hs-ui">
        <div className="hs-id">
          <h1 id="hero-title" className="hs-title" lang="bn">
            <span className="hs-t1"><span className="hs-w">ব্রাহ্মণবাড়িয়া</span></span>
            <span className="hs-lock">
              <span className="hs-org"><span className="hs-w" style={{ animationDelay: '.12s' }}>জেলা</span> <span className="hs-w" style={{ animationDelay: '.2s' }}>ছাত্রকল্যাণ</span> <span className="hs-w" style={{ animationDelay: '.28s' }}>পরিষদ,</span></span>
              <span className="hs-uni"><span className="hs-w" style={{ animationDelay: '.38s' }}>জগন্নাথ বিশ্ববিদ্যালয়</span><small className="hs-w" lang="en" style={{ animationDelay: '.46s' }}>Jagannath University · Dhaka</small></span>
            </span>
          </h1>
          <p className="hs-tag hs-e1">Together We Grow, Together We Belong.</p>
          <p className="hs-tagbn hs-e2" lang="bn">ঐক্য, সহযোগিতা ও শিক্ষার্থীদের কল্যাণে আমরা একসাথে।</p>
          <div className="hs-actions hs-e3">
            <Link className="hs-b1" to="/heritage">
              <span><b>{pick('ঘুরে দেখুন ব্রাহ্মণবাড়িয়া', 'Explore Brahmanbaria')}</b><small>{pick('Explore Brahmanbaria', 'ঘুরে দেখুন ব্রাহ্মণবাড়িয়া')}</small></span>
              <span className="hs-orb"><span className="hs-a1"><Arrow /></span><span className="hs-a2"><Arrow /></span></span>
            </Link>
            <Link className="hs-b2" to="/students">{pick('শিক্ষার্থীদের সাথে যুক্ত হোন', 'Connect with students')} <i><Arrow d="M7 17L17 7M9 7h8v8" size={16} width={2} /></i></Link>
          </div>
        </div>

        {/* chapter dock: count and title, previous / next / pause, four thumbnails with progress */}
        <div className="hs-dock hs-e4" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocusCapture={() => setHeld(true)} onBlurCapture={() => setHeld(false)}>
          <div className="hs-now">
            <p className="hs-count"><span>{s.no}<small>/ {SCENES.at(-1).no}</small></span><em key={i}>{pick(s.bn, s.en)}</em></p>
            <button type="button" className="hs-ctl hs-step" onClick={() => go(i - 1)} aria-label={pick('আগের দৃশ্য', 'Previous scene')}><Arrow d="M15 5l-7 7 7 7" size={16} width={1.9} /></button>
            <button type="button" className="hs-ctl hs-step" onClick={() => go(i + 1)} aria-label={pick('পরের দৃশ্য', 'Next scene')}><Arrow d="M9 5l7 7-7 7" size={16} width={1.9} /></button>
            <button type="button" className="hs-ctl" onClick={() => setPaused(!paused)} aria-pressed={paused}
              aria-label={paused ? pick('দৃশ্য চালু করুন', 'Play scenes') : pick('দৃশ্য থামান', 'Pause scenes')}>
              {paused || reduce ? <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor" /></svg>
                : <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>}
            </button>
          </div>
          <nav className="hs-strip" aria-label={pick('দৃশ্য', 'Scenes')}>
            {SCENES.map((sc, k) => (
              <button key={sc.id} type="button" className={`hs-tab${k === i ? ' is-on' : ''}`} aria-current={k === i ? 'true' : undefined} onClick={() => go(k)} title={pick(sc.bn, sc.en)}>
                <img src={`/images/${sc.id}-640.webp`} alt="" loading="lazy" decoding="async" style={{ objectPosition: sc.pos }} />
                <span className="sr-only">{sc.no} {pick(sc.bn, sc.en)}</span>
                <span className="hs-bar" aria-hidden="true"><i key={k === i ? `${i}-${running}` : 'off'} style={{ animationDuration: `${SCENE_MS}ms` }} /></span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
}
