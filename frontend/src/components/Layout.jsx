import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { Logo } from './Sketch.jsx'
import Icon from './Icon.jsx'
import { useAuth } from '../lib/auth.jsx'

const NAV = [
  ['/', 'nav.home'], ['/about', 'nav.about'], ['/students', 'nav.students'], ['/events', 'nav.events'], ['/alumni', 'nav.alumni'],
  ['/committee', 'nav.committee'], ['/gallery', 'nav.gallery'], ['/faq', 'nav.faq'], ['/contact', 'nav.contact'],
]
const BAR = NAV.slice(1) // the brand already leads home on the bar; the drawer lists every page

function ThemeGlyph({ dark }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> : <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />}
    </svg>
  )
}

function Header() {
  const { t, toggleLang, toggleTheme, isDark } = useApp()
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const signOut = async () => { await logout(); nav('/') }
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const loc = useLocation()
  const onHero = loc.pathname === '/'
  const home = user ? (user.role === 'admin' ? '/admin' : '/dashboard') : null

  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    let raf = 0
    const read = () => { raf = 0; setScrolled(window.scrollY > 8) }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read) }
    read()
    addEventListener('scroll', onScroll, { passive: true })
    return () => { removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', esc)
    return () => { removeEventListener('keydown', esc); document.body.style.overflow = '' }
  }, [open])

  return (
    <header className={`site-header${scrolled ? ' is-scrolled' : ''}${onHero ? ' on-hero' : ''}${open ? ' is-open' : ''}`}>
      <a className="skip" href="#main">{t('nav.skip')}</a>
      <div className="nav-bar">
        <Link to="/" className="brand" aria-label={t('brand')}>
          <Logo size={36} />
          <span><b>{t('brand')}</b><small>{t('brandSub')}</small></span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          {BAR.map(([to, k]) => <NavLink key={to} to={to}>{t(k)}</NavLink>)}
        </nav>
        <div className="nav-tools">
          <Link className="icon-btn hide-sm" to="/students" aria-label={t('common.search')} title={t('common.search')}><Icon name="search" size={18} /></Link>
          <button type="button" className="icon-btn txt" onClick={toggleLang} aria-label={t('lang.toggle')}>{t('lang.toggle')}</button>
          <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={t('theme.toggle')} title={t('theme.toggle')}><ThemeGlyph dark={isDark()} /></button>
          <span className="nav-sep hide-sm" aria-hidden="true" />
          {user
            ? <>
                <Link className="btn btn-dark btn-sm hide-sm" to={home}>{user.role === 'admin' ? t('admin.title') : t('auth.account')}</Link>
                <button type="button" className="btn btn-ghost btn-sm hide-sm" onClick={signOut}>{t('auth.logout')}</button>
              </>
            : <>
                <Link className="btn btn-ghost btn-sm hide-sm" to="/login">{t('nav.login')}</Link>
                <Link className="btn btn-dark btn-sm hide-sm" to="/register">{t('nav.register')}</Link>
              </>}
          <button type="button" className="icon-btn menu-btn" aria-expanded={open} aria-controls="drawer" aria-label={open ? t('nav.close') : t('nav.menu')} onClick={() => setOpen(!open)}>
            <span className="burger" aria-hidden="true"><i /><i /><i /></span>
          </button>
        </div>
      </div>
      <div className="drawer" id="drawer" aria-hidden={!open} inert={open ? undefined : ''}>
        <nav aria-label="Mobile">
          {NAV.map(([to, k], i) => <NavLink key={to} to={to} end={to === '/'} style={{ '--i': i }}>{t(k)}<Icon name="arrow" size={16} /></NavLink>)}
        </nav>
        <div className="drawer-cta">
          {user
            ? <><Link className="btn btn-dark" to={home}>{user.role === 'admin' ? t('admin.title') : t('auth.account')}</Link><button type="button" className="btn btn-ghost" onClick={signOut}>{t('auth.logout')}</button></>
            : <><Link className="btn btn-dark" to="/register">{t('nav.register')}</Link><Link className="btn btn-ghost" to="/login">{t('nav.login')}</Link></>}
        </div>
      </div>
      <button type="button" className="drawer-scrim" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(false)} />
    </header>
  )
}

function Footer() {
  const { t } = useApp()
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <Link to="/" className="brand brand-light"><Logo /><span><b>{t('brand')}</b><small>{t('brandSub')}</small></span></Link>
          <p>{t('footer.desc')}</p>
        </div>
        <div>
          <h2>{t('footer.explore')}</h2>
          <Link to="/about">{t('footer.about')}</Link>
          <Link to="/events">{t('nav.events')}</Link>
          <Link to="/alumni">{t('nav.alumni')}</Link>
          <Link to="/gallery">{t('nav.gallery')}</Link>
        </div>
        <div>
          <h2>{t('footer.members')}</h2>
          <Link to="/membership">{t('nav.membership')}</Link>
          <Link to="/committee">{t('nav.committee')}</Link>
          <Link to="/students">{t('nav.students')}</Link>
          <Link to="/faq">{t('nav.faq')}</Link>
        </div>
        <div>
          <h2>{t('footer.contact')}</h2>
          <span className="footer-line">{t('footer.campus')}</span>
          <Link to="/contact">{t('footer.send')}</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 {t('brand')}</span>
        <span>{t('footer.photos')}</span>
      </div>
    </footer>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  const bare = pathname.startsWith('/admin')
  return (
    <div className={`app ${bare ? 'app-bare' : ''}`}>
      <Header />
      <main id="main"><Outlet /></main>
      {!bare && <Footer />}
    </div>
  )
}
