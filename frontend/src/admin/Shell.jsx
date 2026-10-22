import { useEffect, useState } from 'react'
import { Outlet, useLocation, useSearchParams } from 'react-router-dom'
import './admin.css'
import { BaseProvider } from '../lib/base.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { Gate } from '../pages/Dashboards.jsx'
import CommitteeManager from '../pages/CommitteeAdmin.jsx'
import AdminDashboard from './Dashboard.jsx'
import RolesAdmin from './RolesAdmin.jsx'
import CommandPalette from './CommandPalette.jsx'
import Sidebar from './Sidebar.jsx'
import { FavoritesProvider } from './favorites.jsx'
import { navFor } from './nav.js'
import Icon from './icons.jsx'

const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* a blocked store only loses the preference */ } }

// The admin is a workspace of its own: no public header or footer, one sidebar, content on the right.
export function AdminShell() {
  return <Gate role="admin">{() => <Providers />}</Gate>
}

function Providers() {
  const { user } = useAuth()
  return <FavoritesProvider userId={user?.id}><Frame /></FavoritesProvider>
}

function Frame() {
  const { t } = useApp()
  const loc = useLocation()
  const [params] = useSearchParams()
  const [collapsed, setCollapsed] = useState(() => read('jk-admin-collapsed') === '1')
  const [drawer, setDrawer] = useState(false)
  const [palette, setPalette] = useState(false)
  const title = navFor(loc.pathname, loc.search)?.label

  useEffect(() => setDrawer(false), [loc.pathname, loc.search])
  useEffect(() => { write('jk-admin-collapsed', collapsed ? '1' : '0') }, [collapsed])
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'k') { e.preventDefault(); setPalette((p) => !p) }
      if (k === 'b') { e.preventDefault(); setCollapsed((c) => !c) }
    }
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
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} onSearch={() => setPalette(true)} onNavigate={() => setDrawer(false)} />
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
