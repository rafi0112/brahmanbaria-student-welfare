import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import './admin.css'
import { BaseProvider } from '../lib/base.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { Avatar } from '../components/ui.jsx'
import { Logo } from '../components/Sketch.jsx'
import { Gate } from '../pages/Dashboards.jsx'
import CommitteeManager from '../pages/CommitteeAdmin.jsx'
import AdminDashboard from './Dashboard.jsx'
import RolesAdmin from './RolesAdmin.jsx'
import CommandPalette from './CommandPalette.jsx'
import Icon from './icons.jsx'

const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* a blocked store only loses the preference */ } }

// Left-hand navigation is the only navigation: three small groups, search at the top, account and preferences at the bottom.
const GROUPS = [
  { label: 'ad.nav.g.overview', items: [
    { id: 'dash', to: '/admin', icon: 'dashboard', label: 'admin.nav.dash' },
    { id: 'activity', to: '/admin/activity', icon: 'clock', label: 'ad.nav.activity' },
  ] },
  { label: 'ad.nav.g.people', items: [
    { id: 'students', to: '/admin/students', icon: 'users', label: 'admin.nav.students' },
    { id: 'roles', to: '/admin?tab=roles', icon: 'shield', label: 'admin.tab.roles' },
    { id: 'committee', to: '/admin?tab=committee', icon: 'star', label: 'admin.tab.committee' },
  ] },
  { label: 'ad.nav.g.content', items: [
    { id: 'heritage', to: '/admin/heritage', icon: 'landmark', label: 'admin.nav.places' },
    { id: 'blog', to: '/admin/blog', icon: 'pen', label: 'admin.nav.blog' },
    { id: 'gallery', to: '/admin/gallery', icon: 'image', label: 'admin.nav.gallery' },
  ] },
]

function activeId(pathname, tab) {
  if (pathname === '/admin') return tab === 'roles' ? 'roles' : tab === 'committee' ? 'committee' : 'dash'
  const hit = GROUPS.flatMap((g) => g.items).find((i) => i.id !== 'dash' && !i.to.includes('?') && (pathname === i.to || pathname.startsWith(`${i.to}/`)))
  return hit ? hit.id : ''
}

// The admin is a workspace of its own: no public header or footer, one sidebar, content on the right.
export function AdminShell() {
  return <Gate role="admin">{() => <Frame />}</Gate>
}

function Frame() {
  const { t, lang, toggleLang, toggleTheme, isDark } = useApp()
  const { user: me, profile, logout } = useAuth()
  const go = useNavigate()
  const loc = useLocation()
  const [params] = useSearchParams()
  const [collapsed, setCollapsed] = useState(() => read('jk-admin-collapsed') === '1')
  const [drawer, setDrawer] = useState(false)
  const [palette, setPalette] = useState(false)
  const current = activeId(loc.pathname, params.get('tab'))
  const items = useMemo(() => GROUPS.flatMap((g) => g.items), [])
  const title = items.find((i) => i.id === current)?.label
  const name = profile?.name || me?.email?.split('@')[0] || ''

  useEffect(() => setDrawer(false), [loc.pathname, loc.search])
  useEffect(() => { write('jk-admin-collapsed', collapsed ? '1' : '0') }, [collapsed])
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p) } }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (!drawer) return undefined
    const onKey = (e) => e.key === 'Escape' && setDrawer(false)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [drawer])

  return (
    <div className="adm" data-collapsed={collapsed} data-open={drawer}>
      <a className="adm-skip" href="#adm-main">{t('nav.skip')}</a>
      <aside className="adm-side" id="adm-side" aria-label={t('admin.title')}>
        <div className="adm-side-head">
          <Link to="/admin" className="adm-brand" title={t('brand')}><Logo size={28} /><span className="adm-fade"><b>{t('brand')}</b><small>{t('admin.title')}</small></span></Link>
          <button type="button" className="adm-iconbtn adm-collapse" onClick={() => setCollapsed(!collapsed)} aria-pressed={collapsed}
            aria-label={t(collapsed ? 'ad.nav.expand' : 'ad.nav.collapse')} title={t(collapsed ? 'ad.nav.expand' : 'ad.nav.collapse')}><Icon name="panel" size={18} /></button>
        </div>

        <button type="button" className="adm-search" onClick={() => setPalette(true)} aria-label={t('ad.cmd.open')} title={t('ad.cmd.open')}>
          <Icon name="search" size={16} /><span className="adm-fade">{t('ad.cmd.short')}</span><kbd className="adm-fade">Ctrl K</kbd>
        </button>

        <nav className="adm-nav" aria-label={t('admin.title')}>
          {GROUPS.map((g) => (
            <div className="adm-group" key={g.label}>
              <p className="adm-group-label adm-fade">{t(g.label)}</p>
              {g.items.map((i) => (
                <Link key={i.id} to={i.to} className={`adm-link ${current === i.id ? 'on' : ''}`} aria-current={current === i.id ? 'page' : undefined} title={t(i.label)}>
                  <Icon name={i.icon} size={18} /><span className="adm-fade">{t(i.label)}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="adm-side-foot">
          <a className="adm-link" href="/" target="_blank" rel="noopener noreferrer" title={t('admin.nav.exit')}><Icon name="external" size={18} /><span className="adm-fade">{t('admin.nav.exit')}</span></a>
          <div className="adm-prefs">
            <button type="button" className="adm-iconbtn" onClick={toggleLang} aria-label={t('lang.toggle')} title={t('lang.toggle')}><Icon name="globe" size={17} /><span className="adm-fade adm-lang">{lang === 'bn' ? 'EN' : 'বাং'}</span></button>
            <button type="button" className="adm-iconbtn" onClick={toggleTheme} aria-label={t('theme.toggle')} title={t('theme.toggle')}><Icon name={isDark() ? 'sun' : 'moon'} size={17} /></button>
          </div>
          <div className="adm-account">
            <Avatar name={name || '?'} size={30} />
            <span className="adm-fade adm-id"><strong>{name}</strong><small>{me?.email}</small></span>
            <button type="button" className="adm-iconbtn" onClick={async () => { await logout(); go('/') }} aria-label={t('auth.logout')} title={t('auth.logout')}><Icon name="logout" size={17} /></button>
          </div>
        </div>
      </aside>
      {drawer && <button type="button" className="adm-scrim" aria-label={t('nav.close')} onClick={() => setDrawer(false)} />}

      <div className="adm-body">
        <header className="adm-mbar">
          <button type="button" className="adm-iconbtn" onClick={() => setDrawer(true)} aria-expanded={drawer} aria-controls="adm-side" aria-label={t('nav.menu')}><Icon name="menu" size={20} /></button>
          <strong className="adm-mtitle">{title ? t(title) : t('admin.title')}</strong>
          <button type="button" className="adm-iconbtn" onClick={() => setPalette(true)} aria-label={t('ad.cmd.open')}><Icon name="search" size={18} /></button>
        </header>
        <main id="adm-main" className="adm-main" tabIndex={-1}>
          <div className="adm-page" key={`${loc.pathname}${params.get('tab') || ''}`}>
            <BaseProvider value="/admin"><Outlet /></BaseProvider>
          </div>
        </main>
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  )
}

// /admin shows the dashboard; ?tab=roles and ?tab=committee open the two management sections.
export function AdminHome() {
  const [params] = useSearchParams()
  const tab = params.get('tab')
  if (tab === 'roles') return <RolesAdmin />
  if (tab === 'committee') return <CommitteeManager />
  return <AdminDashboard />
}
