import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { Logo } from './Sketch.jsx'
import Icon from './Icon.jsx'
import { PageLeaves } from './ui.jsx'
import { useAuth } from '../lib/auth.jsx'

const NAV = [
  ['/', 'nav.home'], ['/about', 'nav.about'], ['/students', 'nav.students'], ['/events', 'nav.events'], ['/alumni', 'nav.alumni'],
  ['/committee', 'nav.committee'], ['/gallery', 'nav.gallery'], ['/faq', 'nav.faq'], ['/contact', 'nav.contact'],
]

function Header() {
  const { t, toggleLang, toggleTheme, isDark } = useApp()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [open])

  return (
    <header className="site-header">
      <a className="skip" href="#main">{t('nav.skip')}</a>
      <div className="nav-pill">
        <Link to="/" className="brand" aria-label={t('brand')}>
          <Logo />
          <span><b>{t('brand')}</b><small>{t('brandSub')}</small></span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          {NAV.map(([to, k]) => <NavLink key={to} to={to} end={to === '/'}>{t(k)}</NavLink>)}
        </nav>
        <div className="nav-tools">
          <Link className="icon-btn hide-sm" to="/students" aria-label={t('common.search')}><Icon name="search" size={18} /></Link>
          <button className="icon-btn txt" onClick={toggleLang} aria-label={t('lang.toggle')}>{t('lang.toggle')}</button>
          <button className="icon-btn" onClick={toggleTheme} aria-label={t('theme.toggle')} title={t('theme.toggle')}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {isDark() ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> : <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />}
            </svg>
          </button>
          {user
            ? <Link className="btn btn-dark btn-sm hide-sm" to={user.role === 'admin' ? '/admin' : '/dashboard'}>{user.role === 'admin' ? t('admin.title') : t('auth.account')}</Link>
            : <Link className="btn btn-dark btn-sm hide-sm" to="/login">{t('nav.login')}</Link>}
          <button className="icon-btn menu-btn" aria-expanded={open} aria-controls="drawer" aria-label={open ? t('nav.close') : t('nav.menu')} onClick={() => setOpen(!open)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="drawer" id="drawer">
          {NAV.map(([to, k]) => <NavLink key={to} to={to} end={to === '/'}>{t(k)}</NavLink>)}
          <div className="drawer-cta">
            {user
              ? <Link className="btn btn-dark" to={user.role === 'admin' ? '/admin' : '/dashboard'}>{t('auth.account')}</Link>
              : <><Link className="btn btn-dark" to="/login">{t('nav.login')}</Link><Link className="btn btn-ghost" to="/register">{t('nav.register')}</Link></>}
          </div>
        </div>
      )}
    </header>
  )
}

function Footer() {
  const { t } = useApp()
  return (
    <footer className="site-footer">
      <svg className="footer-wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true"><path d="M0 90V40C160 6 330 0 520 24c200 26 330 46 520 28 150-14 270-38 400-42V90z" /></svg>
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
      {!bare && <PageLeaves />}
      <Header />
      <main id="main"><Outlet /></main>
      {!bare && <Footer />}
    </div>
  )
}
