import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../lib/app.jsx'

// A profile shown over the page it was opened from (Students, Alumni) instead of on a page of its own. Escape, the ✕
// button or a click outside close it; the page behind does not scroll; focus moves in and returns to where it was.
export default function ProfileDialog({ label, onClose, children }) {
  const { pick } = useApp()
  const box = useRef(null)
  const press = useRef(false)
  useEffect(() => {
    const prev = document.activeElement
    box.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = (e) => {
      // Escape closes the photo viewer first when one is open over this dialog, and only the next press closes the dialog
      if (e.key === 'Escape' && !document.querySelector('.pv')) { e.stopPropagation(); onClose() }
      if (e.key === 'Tab' && box.current) { // keep Tab inside the dialog
        const f = [...box.current.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null)
        if (!f.length) return
        const first = f[0]; const last = f[f.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = overflow; prev?.focus?.() }
  }, [onClose])
  return createPortal(
    <div className="pd" onPointerDown={(e) => { press.current = e.target === e.currentTarget }} onClick={(e) => { if (e.target === e.currentTarget && press.current) onClose() }}>
      <div className="pd-box" role="dialog" aria-modal="true" aria-label={label} ref={box} tabIndex={-1}>
        <button type="button" className="pd-close" onClick={onClose} aria-label={pick('বন্ধ করুন', 'Close')}>✕</button>
        {children}
      </div>
    </div>,
    document.body,
  )
}
