import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { LeafMark, SketchArt } from './Decor.jsx'
import { AccountMenu, ProfileDialog } from './Account.jsx'
import Icon from './Icon.jsx'
import { MotionLayer, Toasts, toast } from './Motion.jsx'
import { useAuth } from '../lib/auth.jsx'

const NAV = [
  ['/', 'nav.home'], ['/about', 'nav.about'], ['/students', 'nav.students'], ['/events', 'nav.events'], ['/alumni', 'nav.alumni'],
  ['/committee', 'nav.committee'], ['/gallery', 'nav.gallery'], ['/help', 'nav.help'],
]
const BAR = NAV // Home is on the bar too, as the committee asked; the drawer lists every page

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
  const [profileOpen, setProfileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const loc = useLocation()
  const onHero = loc.pathname === '/'
  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    if (!loc.state?.flash) return
    toast(loc.state.flash)
    nav(loc.pathname + loc.search, { replace: true, state: null })
  }, [loc, nav])
  useEffect(() => {
    if (!loc.state?.openProfile || !user) return
    setProfileOpen(true)
    nav(loc.pathname + loc.search, { replace: true, state: null }) // a reload or Back does not open it again
  }, [loc, user, nav])
  useEffect(() => {
    let raf = 0
    const read = () => { raf = 0; setScrolled(window.scrollY > 8) }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read) }
    read()
    addEventListener('scroll', onScroll, { passive: true })
    return () => { removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])
  // The bar fits itself to the space it has, in any language and signed in or not: full size, then compact (tighter
  // links, no brand subtitle), and only when even that does not fit, the menu button. Hidden copies of the links are
  // measured at both sizes, so the choice never depends on the mode currently shown.
  const [mode, setMode] = useState('full')
  const barRef = useRef(null), brandRef = useRef(null), toolsRef = useRef(null), mFull = useRef(null), mCompact = useRef(null), mSub = useRef(null), mName = useRef(null)
  const fit = useCallback(() => {
    const bar = barRef.current
    if (!bar || !mFull.current || !mCompact.current) return
    // the full bar's own gap (clamp(14px, 2vw, 28px)), so the answer does not depend on the mode on screen
    const gap = Math.min(28, Math.max(14, window.innerWidth * 0.02))
    const tools = [...toolsRef.current.children].filter((el) => !el.classList.contains('menu-btn'))
      .reduce((w, el) => w + (el.offsetWidth ? el.offsetWidth + 6 : 0), 0)
    const name = mName.current?.offsetWidth || 0
    const sub = mSub.current?.offsetWidth || 0
    const mark = 48
    const needFull = mark + Math.max(name, sub) + gap + mFull.current.scrollWidth + gap + tools + 16
    const needCompact = mark + name + 12 + mCompact.current.scrollWidth + 12 + tools + 16
    const w = bar.clientWidth
    setMode(w >= needFull ? 'full' : w >= needCompact ? 'compact' : 'menu')
  }, [])
  useLayoutEffect(() => { fit() }, [fit, t, user])
  useEffect(() => {
    const ro = new ResizeObserver(() => fit())
    if (barRef.current) ro.observe(barRef.current)
    document.fonts?.ready?.then(fit)
    return () => ro.disconnect()
  }, [fit])
  useEffect(() => { if (mode !== 'menu') setOpen(false) }, [mode])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', esc)
    return () => { removeEventListener('keydown', esc); document.body.style.overflow = '' }
  }, [open])

  return (
    <header className={`site-header nav-measured nav-${mode}${scrolled ? ' is-scrolled' : ''}${onHero ? ' on-hero' : ''}${open ? ' is-open' : ''}`}>
      <a className="skip" href="#main">{t('nav.skip')}</a>
      {/* measuring copies of the links (never shown, never focusable) */}
      <div className="nav-links nav-measure" ref={mFull} aria-hidden="true" inert="">{BAR.map(([to, k]) => <a key={to}>{t(k)}</a>)}</div>
      <small className="nav-measure m-sub" ref={mSub} aria-hidden="true">{t('brandFull')}</small>
      <span className="brand nav-measure m-name" aria-hidden="true"><b ref={mName}>{t('brand')}</b></span>
      <div className="nav-links nav-measure m-compact" ref={mCompact} aria-hidden="true" inert="">{BAR.map(([to, k]) => <a key={to}>{t(k)}</a>)}</div>
      <div className="nav-bar" ref={barRef}>
        <Link to="/" className="brand" aria-label={t('brand')} ref={brandRef}>
          <LeafMark size={38} />
          <span><b>{t('brand')}</b><small>{t('brandFull')}</small></span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          {BAR.map(([to, k]) => <NavLink key={to} to={to} end={to === '/'}>{t(k)}</NavLink>)}
        </nav>
        <div className="nav-tools" ref={toolsRef}>
          <Link className="icon-btn" to="/students" aria-label={t('common.search')} title={t('common.search')}><Icon name="search" size={18} /></Link>
          <button type="button" className="icon-btn txt" onClick={toggleLang} aria-label={t('lang.toggle')} title={t('lang.toggle')}>{t('lang.toggle')}</button>
          <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={t('theme.toggle')} title={t('theme.toggle')}><ThemeGlyph dark={isDark()} /></button>
          <span className={`nav-sep${user ? '' : ' hide-sm'}`} aria-hidden="true" />
          {user
            ? <AccountMenu onOpenProfile={() => setProfileOpen(true)} />
            : <>
                <Link className="btn btn-ghost btn-sm hide-sm" to="/login">{t('nav.login')}</Link>
                <Link className="btn btn-dark btn-sm hide-sm" to="/register">{t('nav.register')}</Link>
              </>}
          <button type="button" className="icon-btn menu-btn" aria-expanded={open} aria-controls="drawer" aria-label={open ? t('nav.close') : t('nav.menu')} onClick={() => setOpen(!open)}>
            <span className="burger" aria-hidden="true"><i /><i /><i /></span>
          </button>
        </div>
      </div>
      <div className="drawer" id="drawer" inert={open ? undefined : ''}>
        <nav aria-label="Mobile">
          {NAV.map(([to, k], i) => <NavLink key={to} to={to} end={to === '/'} style={{ '--i': i }}>{t(k)}<Icon name="arrow" size={16} /></NavLink>)}
        </nav>
        <div className="drawer-cta">
          {user
            ? <><button type="button" className="btn btn-dark" onClick={() => { setOpen(false); setProfileOpen(true) }}>{t('acct.profile')}</button>{user.role === 'admin' && <Link className="btn btn-outline" to="/admin">{t('admin.title')}</Link>}<button type="button" className="btn btn-quiet" onClick={signOut}>{t('auth.logout')}</button></>
            : <><Link className="btn btn-dark" to="/register">{t('nav.register')}</Link><Link className="btn btn-ghost" to="/login">{t('nav.login')}</Link></>}
        </div>
      </div>
      <button type="button" className="drawer-scrim" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(false)} />
      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}
      <Toasts t={t} />
      <MotionLayer />
    </header>
  )
}

function Footer() {
  const { t } = useApp()
  const { user } = useAuth()
  return (
    <footer className="site-footer">
      <SketchArt src="vine-tl" className="ft-vine" />
      <SketchArt src="river" className="ft-river" />
      <SketchArt src="heritage" className="ft-heritage" />
      <div className="footer-grid">
        <div className="ft-brand">
          <Link to="/" className="brand brand-light"><LeafMark size={46} /><span><b>{t('brand')}</b><small>{t('brandFull')}</small></span></Link>
          <p>{t('footer.tagline')}</p>
        </div>
        <nav aria-label={t('footer.explore')}>
          <h2>{t('footer.explore')}</h2>
          <Link to="/about">{t('nav.about')}</Link>
          <Link to="/students">{t('nav.students')}</Link>
          <Link to="/events">{t('nav.events')}</Link>
          <Link to="/alumni">{t('nav.alumni')}</Link>
          <Link to="/committee">{t('nav.committee')}</Link>
        </nav>
        <nav aria-label={t('footer.discover')}>
          <h2>{t('footer.discover')}</h2>
          <Link to="/heritage">{t('nav.heritage')}</Link>
          <Link to="/directory">{t('footer.upazilas')}</Link>
          <Link to="/gallery">{t('nav.gallery')}</Link>
          <Link to="/blog">{t('nav.blog')}</Link>
          <Link to="/help#faq">{t('nav.faq')}</Link>
        </nav>
        <div>
          <h2>{t('footer.touch')}</h2>
          <Link to="/help#contact">{t('footer.send')}</Link>
          <span className="footer-line">{t('footer.campus')}</span>
          <Link className="btn btn-sm ft-cta" to={user ? (user.role === 'admin' ? '/admin' : '/dashboard') : '/register'}>{user ? t(user.role === 'admin' ? 'admin.title' : 'auth.account') : t('footer.join')} <Icon name="arrow" size={15} className="arr" /></Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 {t('brand')} · {t('brandFull')}</span>
        <span className="ft-motto"><i aria-hidden="true" />{t('footer.motto')}</span>
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
