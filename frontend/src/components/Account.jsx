import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { Avatar } from './ui.jsx'
import Icon from './Icon.jsx'
import { ProfileManager } from '../pages/Dashboards.jsx'

// The signed-in person's button in the header: their photo (or initials) opens a menu with who they are, their profile,
// their dashboard or the admin panel, and sign out.
export function AccountMenu({ onOpenProfile }) {
  const { t } = useApp()
  const { user, profile, logout } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const btn = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    addEventListener('pointerdown', away)
    addEventListener('keydown', esc)
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', esc) }
  }, [open])
  if (!user) return null
  const name = profile?.name || user.email.split('@')[0]
  const isAdmin = user.role === 'admin'
  const go = (fn) => () => { setOpen(false); fn() }
  return (
    <div className="acct" ref={box}>
      <button ref={btn} type="button" className="acct-btn" aria-haspopup="menu" aria-expanded={open} aria-label={t('acct.menu')} onClick={() => setOpen(!open)}>
        <Avatar name={name} photo={profile?.photoUrl} size={34} />
        <svg className="acct-chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-head">
            <Avatar name={name} photo={profile?.photoUrl} size={44} />
            <div>
              <b>{name}</b>
              <small>{user.email}</small>
              <span className={`acct-role ${isAdmin ? 'is-admin' : ''}`}>{isAdmin ? t('admin.roles.admin') : profile?.status === 'approved' ? t('acct.member') : profile ? t('acct.pending') : t('admin.roles.member')}</span>
            </div>
          </div>
          <button type="button" role="menuitem" onClick={go(onOpenProfile)}><Icon name="users" size={17} />{t('acct.profile')}</button>
          {isAdmin && <button type="button" role="menuitem" onClick={go(() => nav('/admin'))}><Icon name="landmark" size={17} />{t('admin.title')}</button>}
          <button type="button" role="menuitem" onClick={go(() => nav('/dashboard'))}><Icon name="book" size={17} />{t('acct.dashboard')}</button>
          <hr />
          <button type="button" role="menuitem" className="acct-out" onClick={go(async () => { await logout(); nav('/') })}><Icon name="arrow" size={17} />{t('auth.logout')}</button>
        </div>
      )}
    </div>
  )
}

// The profile dialog: details and editing of one's own profile, in a native modal dialog (focus trapped, Escape closes).
export function ProfileDialog({ onClose }) {
  const { t } = useApp()
  const { user, profile } = useAuth()
  const ref = useRef(null)
  const [tab, setTab] = useState('details')
  useEffect(() => {
    const d = ref.current
    d?.showModal()
    const cancel = (e) => { e.preventDefault(); onClose() }
    d?.addEventListener('cancel', cancel)
    return () => d?.removeEventListener('cancel', cancel)
  }, [onClose])
  if (!user) return null
  const name = profile?.name || user.email.split('@')[0]
  return (
    <dialog ref={ref} className="pdialog" aria-labelledby="pd-h" onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="pd-inner">
        <header className="pd-head">
          <Avatar name={name} photo={profile?.photoUrl} size={56} />
          <div>
            <h2 id="pd-h">{name}</h2>
            <p className="muted">{user.email}</p>
          </div>
          <button type="button" className="icon-btn pd-close" aria-label={t('nav.close')} onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </header>
        {profile && (
          <div className="pd-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>{t('acct.details')}</button>
            <button type="button" role="tab" aria-selected={tab === 'edit'} className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>{t('acct.edit')}</button>
          </div>
        )}
        <div className="pd-body" role="tabpanel">
          <ProfileManager user={user} view={profile ? tab : 'all'} />
        </div>
        <footer className="pd-foot"><Link to="/dashboard" onClick={onClose} className="link-arrow">{t('acct.openDashboard')} <Icon name="arrow" size={15} className="arr" /></Link></footer>
      </div>
    </dialog>
  )
}
