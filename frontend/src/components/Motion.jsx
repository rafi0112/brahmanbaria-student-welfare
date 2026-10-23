import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const finePointer = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches

// Cards and tiles that fade up one after another as they scroll into view. Rendered lists change often (filters,
// pages), so new elements are picked up by a MutationObserver instead of wrapping every card in a component.
const STAGGER = '.student-card, .alumni-card, .member-card, .advisor-row, .value, .ex-card, .culture-card, .masonry-item, .faq-item, .place-card, .post-card, .ct-info > *, .stats-strip-inline > div, .ch-card'

function useStaggerReveal(path) {
  useEffect(() => {
    if (reduced() || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('sr-in'); io.unobserve(e.target) }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 })
    const seen = new WeakSet()
    const scan = () => {
      document.querySelectorAll(STAGGER).forEach((el) => {
        if (seen.has(el)) return
        seen.add(el)
        const i = Array.prototype.indexOf.call(el.parentElement?.children || [], el)
        el.style.setProperty('--sr-i', String(Math.max(0, i) % 8))
        el.classList.add('sr')
        io.observe(el)
      })
    }
    scan()
    const mo = new MutationObserver(scan)
    mo.observe(document.getElementById('main') || document.body, { childList: true, subtree: true })
    return () => { mo.disconnect(); io.disconnect() }
  }, [path])
}

// Pictures marked data-parallax drift a little slower than the page.
function useParallax(path) {
  useEffect(() => {
    if (reduced()) return undefined
    let raf = 0
    const els = () => document.querySelectorAll('[data-parallax]')
    const run = () => {
      raf = 0
      const vh = innerHeight
      els().forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.bottom < -100 || r.top > vh + 100) return
        const k = Number(el.dataset.parallax) || 0.08
        el.style.setProperty('--py', `${((r.top + r.height / 2 - vh / 2) * -k).toFixed(1)}px`)
      })
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(run) }
    run()
    addEventListener('scroll', on, { passive: true })
    addEventListener('resize', on)
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf) }
  }, [path])
}

// Magnetic buttons (pulled a few pixels toward the pointer) and a soft spotlight that follows the pointer over cards.
function usePointerEffects() {
  useEffect(() => {
    if (!finePointer() || reduced()) return undefined
    let mag = null
    const move = (e) => {
      const card = e.target.closest?.('.spot, .student-card, .alumni-card, .ex-card, .value, .member-card, .faq-help, .cta-band, .state-rich')
      if (card) {
        const r = card.getBoundingClientRect()
        card.style.setProperty('--mx', `${e.clientX - r.left}px`)
        card.style.setProperty('--my', `${e.clientY - r.top}px`)
      }
      const btn = e.target.closest?.('.magnetic, .hx-hit, .phero .btn, .cta-band .btn, .state-actions .btn, .faq-help .btn, .cband .btn')
      if (mag && mag !== btn) { mag.style.transform = ''; mag = null }
      if (btn) {
        const r = btn.getBoundingClientRect()
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height
        btn.style.transform = `translate(${(dx * 8).toFixed(1)}px, ${(dy * 6).toFixed(1)}px)`
        mag = btn
      }
    }
    const leave = () => { if (mag) { mag.style.transform = ''; mag = null } }
    addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerleave', leave)
    return () => { removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave) }
  }, [])
}

// Every page-level effect in one place; mounted once by the public layout.
export function MotionLayer() {
  const { pathname } = useLocation()
  useStaggerReveal(pathname)
  useParallax(pathname)
  usePointerEffects()
  return null
}

// ---------------------------------------------------------------- toasts
// toast('auth.saved') or toast({ text, tone }) from anywhere; the host in the layout shows them for a few seconds.
export function toast(msg) {
  dispatchEvent(new CustomEvent('app-toast', { detail: typeof msg === 'string' ? { key: msg } : msg }))
}

export function Toasts({ t }) {
  const [items, setItems] = useState([])
  useEffect(() => {
    let id = 0
    const add = (e) => {
      const it = { id: ++id, tone: 'ok', ...e.detail }
      setItems((xs) => [...xs.slice(-2), it])
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== it.id)), it.ms || 5000)
    }
    addEventListener('app-toast', add)
    return () => removeEventListener('app-toast', add)
  }, [])
  if (!items.length) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((x) => (
        <div key={x.id} className={`toast toast-${x.tone}`}>
          <Icon name={x.tone === 'bad' ? 'lock' : 'check'} size={16} />
          <span>{x.key ? t(x.key) : x.text}</span>
          <button type="button" aria-label={t('nav.close')} onClick={() => setItems((xs) => xs.filter((y) => y.id !== x.id))}>×</button>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- skeletons
// Placeholders shaped like the content that is loading, so the page does not jump when it arrives.
export function Skeleton({ kind = 'cards', count }) {
  const n = count || { cards: 6, people: 6, list: 5, masonry: 8, committee: 8, detail: 1, block: 3 }[kind] || 6
  const rows = Array.from({ length: n })
  if (kind === 'masonry') {
    return <div className="sk-masonry" aria-hidden="true">{rows.map((_, i) => <span key={i} className="sk sk-tile" style={{ height: `${[220, 160, 260, 190, 240, 170, 210, 280][i % 8]}px` }} />)}</div>
  }
  if (kind === 'list') {
    return <div className="sk-list" aria-hidden="true">{rows.map((_, i) => <span key={i} className="sk sk-row" />)}</div>
  }
  if (kind === 'detail') {
    return (
      <div className="sk-detail" aria-hidden="true">
        <span className="sk sk-cover" />
        <span className="sk sk-line w60" /><span className="sk sk-line w40" /><span className="sk sk-line w80" /><span className="sk sk-line w70" />
      </div>
    )
  }
  if (kind === 'block') {
    return <div className="sk-list" aria-hidden="true">{rows.map((_, i) => <span key={i} className="sk sk-line w80" />)}</div>
  }
  const cls = kind === 'people' || kind === 'committee' ? 'sk-person' : 'sk-card'
  return (
    <div className={`sk-grid ${kind === 'committee' ? 'is-4' : ''}`} aria-hidden="true">
      {rows.map((_, i) => (
        <div key={i} className={`sk-box ${cls}`}>
          {cls === 'sk-card' ? <span className="sk sk-media" /> : <span className="sk sk-avatar" />}
          <span className="sk sk-line w70" /><span className="sk sk-line w45" /><span className="sk sk-line w60" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- marquee
// A slow, endless strip of words. The list is doubled so the loop has no seam; hovering pauses it.
export function Marquee({ items, label }) {
  if (!items.length) return null
  const row = (hidden) => (
    <ul className="mq-row" aria-hidden={hidden || undefined}>
      {items.map((x, i) => <li key={i}><span className="mq-dot" aria-hidden="true">✦</span>{x}</li>)}
    </ul>
  )
  return (
    <section className="marquee" aria-label={label}>
      <div className="mq-track">{row(false)}{row(true)}</div>
    </section>
  )
}

// Words that rise into place one by one (the page titles).
export function SplitText({ text, className, start = 0 }) {
  if (typeof text !== 'string') return text
  return text.split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) ? w : <span key={i} className={`st-w ${className || ''}`} style={{ '--st-i': start + i }}><span>{w}</span></span>))
}
