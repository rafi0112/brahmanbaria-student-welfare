import { useEffect, useState } from 'react'
import { onWaiting } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'

// When the server takes more than a few seconds (it wakes up from sleep on the free plan), say so, so the page does not
// look broken. It disappears as soon as the answers arrive.
export function SlowServerNotice() {
  const { t } = useApp()
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    let timer = 0
    const off = onWaiting((n) => {
      if (n > 0 && !timer) timer = setTimeout(() => setSlow(true), 5000)
      if (n === 0) { clearTimeout(timer); timer = 0; setSlow(false) }
    })
    return () => { off(); clearTimeout(timer) }
  }, [])
  if (!slow) return null
  return <div className="slow-note" role="status" aria-live="polite"><span className="slow-dot" aria-hidden="true" />{t('common.serverWaking')}</div>
}

// A round button back to the top, shown once the visitor has scrolled well down a long page.
export function BackToTop() {
  const { t } = useApp()
  const [show, setShow] = useState(false)
  useEffect(() => {
    const on = () => setShow(window.scrollY > window.innerHeight * 1.5)
    on()
    addEventListener('scroll', on, { passive: true })
    return () => removeEventListener('scroll', on)
  }, [])
  return (
    <button type="button" className={`to-top${show ? ' is-on' : ''}`} aria-label={t('common.backToTop')} title={t('common.backToTop')} tabIndex={show ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  )
}
