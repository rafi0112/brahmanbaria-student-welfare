import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'

// Which part of "Website texts" holds a public page's words.
const PARTS = [['/about', 'about'], ['/students', 'students'], ['/alumni', 'alumni'], ['/committee', 'committee'], ['/events', 'events'], ['/gallery', 'gallery'],
  ['/heritage', 'heritage'], ['/directory', 'heritage'], ['/blog', 'blog'], ['/help', 'help'], ['/membership', 'account'], ['/login', 'account'], ['/register', 'account']]

// For a signed-in admin only: a small button on each public page that opens "Website texts" at that page's words.
export function EditTextsButton() {
  const { t } = useApp()
  const { user } = useAuth()
  const { pathname } = useLocation()
  if (user?.role !== 'admin' || pathname.startsWith('/admin')) return null
  const part = pathname === '/' ? 'home' : PARTS.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))?.[1]
  if (!part) return null
  return (
    <Link className="edit-texts" to={`/admin/site-texts?part=${part}`} title={t('common.editTextsHint')}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {t('common.editTexts')}
    </Link>
  )
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
