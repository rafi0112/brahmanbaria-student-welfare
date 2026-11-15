import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../lib/app.jsx'

const MIN = 1
const MAX = 6

// A full-screen photo viewer: zoom with the + / − buttons, the keyboard (+ − 0), the mouse wheel or a pinch, double-click
// (or double-tap) to zoom in and out, drag to move a zoomed photo, Escape or a click outside to close.
export default function PhotoViewer({ src, alt = '', onClose }) {
  const { pick } = useApp()
  const [z, setZ] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const stage = useRef(null)
  const closeBtn = useRef(null)
  const pts = useRef(new Map()) // active pointers, for drag and pinch
  const last = useRef({ x: 0, y: 0, d: 0 })
  const pressed = useRef(null) // what the press started on: only a press on the empty backdrop may close the viewer
  const moved = useRef(0)

  const clampPos = useCallback((p, zoom) => {
    const el = stage.current
    if (!el || zoom <= 1) return { x: 0, y: 0 }
    const lim = { x: (el.clientWidth * (zoom - 1)) / 2, y: (el.clientHeight * (zoom - 1)) / 2 }
    return { x: Math.max(-lim.x, Math.min(lim.x, p.x)), y: Math.max(-lim.y, Math.min(lim.y, p.y)) }
  }, [])
  const setZoom = useCallback((next) => {
    setZ((cur) => {
      const v = Math.max(MIN, Math.min(MAX, typeof next === 'function' ? next(cur) : next))
      setPos((p) => clampPos(p, v))
      return v
    })
  }, [clampPos])

  useEffect(() => {
    const prevFocus = document.activeElement
    closeBtn.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') setZoom((v) => v * 1.4)
      else if (e.key === '-' || e.key === '_') setZoom((v) => v / 1.4)
      else if (e.key === '0') setZoom(1)
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prevOverflow; prevFocus?.focus?.() }
  }, [onClose, setZoom])

  // a wheel listener that is not passive, so the page behind never scrolls while zooming
  useEffect(() => {
    const el = stage.current
    if (!el) return undefined
    const wheel = (e) => { e.preventDefault(); setZoom((v) => v * (e.deltaY < 0 ? 1.15 : 1 / 1.15)) }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [setZoom])

  const down = (e) => {
    pressed.current = e.target
    moved.current = 0
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    last.current = { x: e.clientX, y: e.clientY, d: 0 }
    setDragging(true)
  }
  const move = (e) => {
    if (!pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    moved.current += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0)
    const list = [...pts.current.values()]
    if (list.length >= 2) { // pinch
      const d = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y)
      if (last.current.d) setZoom((v) => v * (d / last.current.d))
      last.current.d = d
      return
    }
    if (z > 1) {
      const dx = e.clientX - last.current.x
      const dy = e.clientY - last.current.y
      setPos((p) => clampPos({ x: p.x + dx, y: p.y + dy }, z))
    }
    last.current.x = e.clientX; last.current.y = e.clientY
  }
  const up = (e) => { pts.current.delete(e.pointerId); last.current.d = 0; if (pts.current.size === 0) setDragging(false) }

  return createPortal(
    <div className="pv" role="dialog" aria-modal="true" aria-label={alt || pick('ছবি', 'Photo')} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pv-bar">
        <button type="button" className="pv-btn" onClick={() => setZoom((v) => v / 1.4)} disabled={z <= MIN} aria-label={pick('ছোট করুন', 'Zoom out')}>−</button>
        <span className="pv-pct" aria-live="polite">{Math.round(z * 100)}%</span>
        <button type="button" className="pv-btn" onClick={() => setZoom((v) => v * 1.4)} disabled={z >= MAX} aria-label={pick('বড় করুন', 'Zoom in')}>+</button>
        <button type="button" className="pv-btn pv-txt" onClick={() => setZoom(1)} disabled={z === 1}>{pick('রিসেট', 'Reset')}</button>
        <button ref={closeBtn} type="button" className="pv-btn pv-close" onClick={onClose} aria-label={pick('বন্ধ করুন', 'Close')}>✕</button>
      </div>
      <div className="pv-stage" ref={stage} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClick={(e) => { if (e.target === stage.current && pressed.current === stage.current && moved.current < 5) onClose() }}
        onDoubleClick={() => setZoom((v) => (v > 1 ? 1 : 2.5))} style={{ cursor: z > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}>
        <img src={src} alt={alt} draggable="false" style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${z})`, transition: dragging ? 'none' : 'transform .18s ease-out' }} />
      </div>
      <p className="pv-hint">{pick('স্ক্রল বা ডাবল-ক্লিক করে বড় করুন, টেনে সরান', 'Scroll or double-click to zoom, drag to move')}</p>
    </div>,
    document.body,
  )
}
