import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import images from '../data/images.json'
import { useApp } from '../lib/app.jsx'
import Icon from './Icon.jsx'

const SLIDE_MS = 6500

// The picture of an event: an uploaded file (imageUrl) or one of the bundled photos (image id).
export function eventImage(e) {
  if (e.imageUrl) return { src: e.imageUrl, srcSet: undefined }
  if (e.image && images[e.image]) {
    const set = [`/images/${e.image}-640.webp 640w`, `/images/${e.image}-1280.webp 1280w`]
    if (images[e.image].wide) set.push(`/images/${e.image}-1920.webp 1920w`)
    return { src: `/images/${e.image}-1280.webp`, srcSet: set.join(', ') }
  }
  return null
}

export function eventDate(date, lang, n) {
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const loc = lang === 'bn' ? 'bn-BD' : 'en-GB'
  return { day: n(d.getDate()), month: d.toLocaleDateString(loc, { month: 'short' }), long: d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }
}

// Home page events: one event at a time across the full width. Slides cross-fade with a slow Ken Burns zoom, the text
// rises in, and the picture follows the pointer slightly (parallax). It advances on its own, pauses while the visitor
// hovers, focuses or the tab is hidden, and never moves on its own with reduced motion. Arrows, dots, swipe and the
// keyboard work too.
export default function EventCarousel({ items, loading }) {
  const { t, pick, n, lang } = useApp()
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [reduce] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const root = useRef(null)
  const touch = useRef(null)
  const count = items.length
  const go = useCallback((k) => setI(() => ((k % count) + count) % count), [count])
  useEffect(() => { if (i >= count && count) setI(0) }, [count, i])
  useEffect(() => {
    const vis = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [])
  const running = count > 1 && !paused && !hidden && !reduce
  useEffect(() => {
    if (!running) return undefined
    const id = setTimeout(() => go(i + 1), SLIDE_MS)
    return () => clearTimeout(id)
  }, [running, i, go])

  const onMove = (ev) => {
    if (reduce || !root.current) return
    const r = root.current.getBoundingClientRect()
    root.current.style.setProperty('--px', ((ev.clientX - r.left) / r.width - 0.5).toFixed(3))
    root.current.style.setProperty('--py', ((ev.clientY - r.top) / r.height - 0.5).toFixed(3))
  }
  const onKey = (ev) => {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); go(i + 1) }
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); go(i - 1) }
  }

  if (loading) return <div className="evx evx-skeleton" role="status"><span className="sr-only">{t('state.loading')}</span></div>
  if (count === 0) {
    return (
      <div className="evc-empty">
        <Icon name="calendar" size={26} />
        <p>{pick('এই মুহূর্তে কোনো ইভেন্ট প্রকাশিত নেই। নতুন আয়োজন প্রকাশিত হলেই এখানে দেখা যাবে।', 'No events are published right now. New ones appear here as soon as they are published.')}</p>
        <Link className="btn btn-outline btn-sm" to="/help#contact">{t('events.suggest')}</Link>
      </div>
    )
  }
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className={`evx${running ? ' is-running' : ''}`} ref={root} role="region" aria-roledescription="carousel" aria-label={pick('ইভেন্ট', 'Events')}
      tabIndex={0} onKeyDown={onKey} onMouseMove={onMove}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => { setPaused(false); root.current?.style.setProperty('--px', 0); root.current?.style.setProperty('--py', 0) }}
      onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
      onTouchStart={(ev) => { touch.current = ev.touches[0].clientX; setPaused(true) }}
      onTouchEnd={(ev) => { const dx = ev.changedTouches[0].clientX - (touch.current ?? 0); if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); setPaused(false) }}>
      {items.map((e, k) => {
        const img = eventImage(e)
        const d = eventDate(e.date, lang, n)
        const on = k === i
        return (
          <article key={e.slug || e.date + e.titleEn} className={`evx-slide${on ? ' is-on' : ''}`} aria-hidden={!on} inert={on ? undefined : ''}
            role="group" aria-roledescription="slide" aria-label={`${n(k + 1)} / ${n(count)}`}>
            <div className={`evx-media kb-${k % 3}`}>
              {img ? <img src={img.src} srcSet={img.srcSet} sizes="100vw" alt="" loading={k === 0 ? 'eager' : 'lazy'} decoding="async" /> : <div className="evx-noimg" />}
            </div>
            <div className="evx-shade" aria-hidden="true" />
            <div className="evx-copy">
              <p className="evx-kicker">
                <span className={`evx-when ${e.date >= today ? 'up' : 'past'}`}>{e.date >= today ? pick('আসন্ন', 'Upcoming') : pick('সম্পন্ন', 'Past')}</span>
                {e.featured && <span className="evx-feat">★ {pick('ফিচার্ড', 'Featured')}</span>}
              </p>
              <h3 className="evx-title">{pick(e.titleBn, e.titleEn)}</h3>
              <p className="evx-meta">
                {d && <span><Icon name="calendar" size={16} /> {d.long}{e.time ? ` · ${e.time}` : ''}</span>}
                {e.venue && <span><Icon name="pin" size={16} /> {e.venue}</span>}
              </p>
              {(e.summaryBn || e.summaryEn || e.summary) && <p className="evx-sum">{pick(e.summaryBn, e.summaryEn) || e.summary}</p>}
              <div className="evx-actions">
                {e.slug && <Link className="btn btn-dark" to={`/events/${e.slug}`} tabIndex={on ? 0 : -1}>{pick('বিস্তারিত দেখুন', 'View details')} <Icon name="arrow" size={16} className="arr" /></Link>}
                <Link className="btn evx-ghost" to="/events" tabIndex={on ? 0 : -1}>{pick('সব ইভেন্ট', 'View all events')}</Link>
              </div>
            </div>
            {d && <time className="evx-date" dateTime={e.date} aria-hidden="true"><b>{d.day}</b><span>{d.month}</span></time>}
          </article>
        )
      })}
      {count > 1 && (
        <div className="evx-nav">
          <button type="button" className="evx-arrow" onClick={() => go(i - 1)} aria-label={pick('আগের ইভেন্ট', 'Previous event')}><Icon name="arrow" size={20} /></button>
          <div className="evx-dots" role="tablist" aria-label={pick('ইভেন্ট বেছে নিন', 'Choose an event')}>
            {items.map((e, k) => (
              <button key={k} type="button" role="tab" aria-selected={k === i} className={`evx-dot${k === i ? ' is-on' : ''}`} onClick={() => go(k)}
                aria-label={`${n(k + 1)}: ${pick(e.titleBn, e.titleEn)}`}>
                <span className="evx-dot-fill" key={k === i ? `${i}-${running}` : 'off'} style={{ animationDuration: `${SLIDE_MS}ms` }} />
              </button>
            ))}
          </div>
          <span className="evx-count num" aria-live="polite">{n(String(i + 1).padStart(2, '0'))} / {n(String(count).padStart(2, '0'))}</span>
          <button type="button" className="evx-arrow" onClick={() => go(i + 1)} aria-label={pick('পরের ইভেন্ট', 'Next event')}><Icon name="arrow" size={20} /></button>
        </div>
      )}
    </div>
  )
}
