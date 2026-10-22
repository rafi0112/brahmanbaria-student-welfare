import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { Logo } from '../components/Sketch.jsx'
import { folders } from '../lib/favorites.js'
import { useFavorites } from './favorites.jsx'
import Icon, { NavIcon } from './icons.jsx'
import { Confirm, RowMenu } from './kit.jsx'
import ProfileModal, { MonoAvatar } from './ProfileModal.jsx'
import { GROUPS, NAV, activeChild, childTo, navFor } from './nav.js'

const here = (loc) => `${loc.pathname}${loc.search}`
// A favorite is "current" when its path and query match the address exactly (a plain path matches only the unfiltered page).
const isCurrent = (to, loc) => to === here(loc) || (!to.includes('?') && to === loc.pathname && !loc.search)

function iconFor(to) {
  const [path, query = ''] = to.split('?')
  return navFor(path, query ? `?${query}` : '')?.icon || 'star'
}

// One animated fold: height follows the grid-row trick, and a closed fold is inert so keyboard focus cannot enter it.
function Fold({ open, children }) {
  return (
    <div className="adm-fold" data-open={open} inert={open ? undefined : ''}>
      <div className="adm-fold-inner">{children}</div>
    </div>
  )
}

function InlineInput({ initial = '', label, onSubmit, onCancel }) {
  const [v, setV] = useState(initial)
  const done = useRef(false)
  const finish = (commit) => {
    if (done.current) return
    done.current = true
    if (commit && v.trim() && v.trim() !== initial) onSubmit(v)
    else onCancel()
  }
  return (
    <form className="fav-inline" onSubmit={(e) => { e.preventDefault(); finish(true) }}>
      <input autoFocus value={v} maxLength={40} aria-label={label} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()}
        onBlur={() => finish(true)} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); finish(false) } }} />
    </form>
  )
}

function NavItem({ item, current, collapsed }) {
  const { t } = useApp()
  return (
    <Link to={item.to} className={`adm-link ${current === item.id ? 'on' : ''}`} aria-current={current === item.id ? 'page' : undefined} title={t(item.label)}>
      <NavIcon name={item.icon} /><span className="adm-fade">{t(item.label)}</span>
    </Link>
  )
}

// A section whose children are filtered list views. The parent only opens and closes; a child is a real link.
function Parent({ item, current, collapsed }) {
  const { t } = useApp()
  const fav = useFavorites()
  const loc = useLocation()
  const key = `nav:${item.id}`
  const here = current === item.id
  const child = here ? activeChild(item, loc.search) : null
  const open = !collapsed && fav.state.groups[key] === true
  // arriving on a page of this section (link, refresh, back/forward) reveals its children
  useEffect(() => { if (here && fav.state.groups[key] !== true) fav.setGroup(key, true) }, [here, loc.pathname, loc.search]) // eslint-disable-line react-hooks/exhaustive-deps
  if (collapsed) {
    return <Link to={item.to} className={`adm-link ${here ? 'on' : ''}`} aria-current={here ? 'page' : undefined} title={t(item.label)} aria-label={t(item.label)}><NavIcon name={item.icon} /></Link>
  }
  return (
    <div className="adm-parent" data-open={open}>
      <button type="button" className={`adm-link adm-parent-btn ${here && !child ? 'cur' : ''}`} aria-expanded={open} onClick={() => fav.setGroup(key, !open)}>
        <NavIcon name={item.icon} /><span className="adm-fade">{t(item.label)}</span><Icon name="chevronDown" size={13} className="adm-pcaret" />
      </button>
      <Fold open={open}>
        <div className="adm-children">
          {item.children.map((c) => (
            <Link key={c.id} to={childTo(item, c)} className={`adm-child ${child?.id === c.id ? 'on' : ''}`} aria-current={child?.id === c.id ? 'page' : undefined}>
              <span>{t(c.label)}</span>
            </Link>
          ))}
        </div>
      </Fold>
    </div>
  )
}

function Group({ group, current, collapsed }) {
  const { t } = useApp()
  const fav = useFavorites()
  const items = NAV.filter((n) => n.group === group.id)
  const open = collapsed || fav.state.groups[group.id] !== false
  const holdsCurrent = items.some((i) => i.id === current)
  useEffect(() => { if (holdsCurrent && fav.state.groups[group.id] === false) fav.setGroup(group.id, true) }, [holdsCurrent, current]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="adm-group" data-open={open}>
      <button type="button" className="adm-gh" aria-expanded={open} onClick={() => fav.setGroup(group.id, !open)} tabIndex={collapsed ? -1 : 0}>
        <Icon name="chevron" size={12} className="adm-caret" /><span className="adm-fade">{t(group.label)}</span>
      </button>
      <Fold open={open}>{items.map((i) => (i.children ? <Parent key={i.id} item={i} current={current} collapsed={collapsed} /> : <NavItem key={i.id} item={i} current={current} collapsed={collapsed} />))}</Fold>
    </div>
  )
}

function Favorites({ current, onExpand, collapsed }) {
  const { t } = useApp()
  const fav = useFavorites()
  const loc = useLocation()
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [drag, setDrag] = useState(null)
  const [over, setOver] = useState(null)
  const [note, setNote] = useState('')
  const { items, groups } = fav.state
  const open = groups.favorites !== false
  const flds = folders(fav.state)
  const say = (r) => { setNote(r.ok ? '' : t(`ad.fav.err.${r.reason}`)); return r.ok }

  // a folder that holds the page you are on opens by itself
  useEffect(() => {
    for (const f of flds) if (!f.open && f.items.some((l) => isCurrent(l.to, loc))) fav.toggleFolder(f.id, true)
  }, [loc.pathname, loc.search]) // eslint-disable-line react-hooks/exhaustive-deps

  if (collapsed) {
    return <button type="button" className="adm-link adm-rail-star" onClick={onExpand} title={t('ad.nav.favorites')} aria-label={t('ad.nav.favorites')}><NavIcon name="star" tone="gold" /></button>
  }

  const linkMenu = (link, parent) => {
    const siblings = parent ? parent.items : items
    const idx = siblings.findIndex((x) => x.id === link.id)
    return [
      { label: t('ad.fav.rename'), onClick: () => setRenaming(link.id) },
      { label: t('ad.fav.moveUp'), onClick: () => fav.shift(link.id, -1), disabled: idx <= 0 },
      { label: t('ad.fav.moveDown'), onClick: () => fav.shift(link.id, 1), disabled: idx >= siblings.length - 1 },
      ...(parent ? [{ label: t('ad.fav.toTop'), onClick: () => fav.moveLink(link.id, { folderId: null }) }] : []),
      ...flds.filter((f) => f.id !== parent?.id).map((f) => ({ label: `${t('ad.fav.moveTo')} ${f.name}`, onClick: () => fav.moveLink(link.id, { folderId: f.id }) })),
      { label: t('ad.fav.remove'), onClick: () => fav.remove(link.id), danger: true },
    ]
  }

  const dropProps = (target) => ({
    draggable: renaming !== target.id,
    onDragStart: (e) => { setDrag({ id: target.id, type: target.type }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', target.id) },
    onDragEnd: () => { setDrag(null); setOver(null) },
    onDragOver: (e) => {
      if (!drag || drag.id === target.id) return
      if (drag.type === 'folder' && target.parentId) return
      e.preventDefault()
      setOver({ id: target.id, pos: target.type === 'folder' && drag.type === 'link' ? 'into' : 'before' })
    },
    onDrop: (e) => {
      e.preventDefault()
      const d = drag
      setDrag(null); setOver(null)
      if (!d || d.id === target.id) return
      if (d.type === 'link') fav.moveLink(d.id, target.type === 'folder' ? { folderId: target.id } : { folderId: target.parentId || null, beforeId: target.id })
      else if (!target.parentId) fav.moveTop(d.id, target.id)
    },
  })
  const dropCls = (id) => (over?.id === id ? ` drop-${over.pos}` : '')

  const LinkRow = ({ link, parent }) => {
    const active = isCurrent(link.to, loc)
    return (
      <div className={`fav-row ${active ? 'on' : ''}${dropCls(link.id)}`} {...dropProps({ id: link.id, type: 'link', parentId: parent?.id })}>
        {renaming === link.id
          ? <InlineInput initial={link.label} label={t('ad.fav.rename')} onSubmit={(v) => { say(fav.renameLink(link.id, v)); setRenaming(null) }} onCancel={() => setRenaming(null)} />
          : <Link to={link.to} className="fav-link" aria-current={active ? 'page' : undefined} title={link.label}><NavIcon name={iconFor(link.to)} size={13} /><span className="fav-text">{link.label}</span></Link>}
        <RowMenu className="fav-more" icon="more" label={`${t('ad.actions')}: ${link.label}`} items={linkMenu(link, parent)} />
      </div>
    )
  }

  const FolderRow = ({ folder }) => {
    const idx = items.findIndex((x) => x.id === folder.id)
    const holdsCurrent = folder.items.some((l) => isCurrent(l.to, loc))
    return (
      <div className="fav-folder">
        <div className={`fav-row fav-folder-row ${holdsCurrent && !folder.open ? 'has-current' : ''}${dropCls(folder.id)}`} {...dropProps({ id: folder.id, type: 'folder' })}>
          {renaming === folder.id
            ? <InlineInput initial={folder.name} label={t('ad.fav.rename')} onSubmit={(v) => { say(fav.renameFolder(folder.id, v)); setRenaming(null) }} onCancel={() => setRenaming(null)} />
            : (
              <button type="button" className="fav-toggle" aria-expanded={folder.open} onClick={() => fav.toggleFolder(folder.id)} title={folder.name}>
                <Icon name="chevron" size={12} className="adm-caret" /><NavIcon name="folder" size={13} /><span className="fav-text">{folder.name}</span>
              </button>
            )}
          <RowMenu className="fav-more" icon="more" label={`${t('ad.actions')}: ${folder.name}`} items={[
            { label: t('ad.fav.rename'), onClick: () => setRenaming(folder.id) },
            { label: t('ad.fav.moveUp'), onClick: () => fav.shift(folder.id, -1), disabled: idx <= 0 },
            { label: t('ad.fav.moveDown'), onClick: () => fav.shift(folder.id, 1), disabled: idx >= items.length - 1 },
            { label: t('ad.fav.deleteFolder'), danger: true, onClick: () => (folder.items.length ? setConfirm(folder) : fav.deleteFolder(folder.id)) },
          ]} />
        </div>
        <Fold open={folder.open}>
          <div className="fav-children">
            {folder.items.length === 0 ? <p className="fav-empty">{t('ad.fav.emptyFolder')}</p> : folder.items.map((l) => <LinkRow key={l.id} link={l} parent={folder} />)}
          </div>
        </Fold>
      </div>
    )
  }

  return (
    <div className="adm-group adm-favs" data-open={open}>
      <div className="adm-gh-row">
        <button type="button" className="adm-gh" aria-expanded={open} onClick={() => fav.setGroup('favorites', !open)}>
          <Icon name="chevron" size={12} className="adm-caret" /><span>{t('ad.nav.favorites')}</span>
        </button>
        <button type="button" className="adm-iconbtn gh-add" onClick={() => { fav.setGroup('favorites', true); setCreating(true); setNote('') }} aria-label={t('ad.fav.newFolder')} title={t('ad.fav.newFolder')}>
          <Icon name="folderPlus" size={15} />
        </button>
      </div>
      <Fold open={open}>
        <div className="fav-list">
          {creating && (
            <div className="fav-row">
              <NavIcon name="folder" size={13} />
              <InlineInput label={t('ad.fav.folderName')} onSubmit={(v) => { say(fav.addFolder(v)); setCreating(false) }} onCancel={() => setCreating(false)} />
            </div>
          )}
          {items.map((it) => (it.type === 'folder' ? <FolderRow key={it.id} folder={it} /> : <LinkRow key={it.id} link={it} />))}
          {items.length === 0 && !creating && <p className="fav-empty">{t('ad.fav.empty')}</p>}
          {drag && <div className={`fav-end${over?.id === '__end' ? ' drop-before' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver({ id: '__end', pos: 'before' }) }}
            onDrop={(e) => { e.preventDefault(); const d = drag; setDrag(null); setOver(null); if (d.type === 'link') fav.moveLink(d.id, { folderId: null }); else fav.moveTop(d.id, null) }}>{t('ad.fav.dropEnd')}</div>}
          <p className="sr-only" role="status" aria-live="polite">{note}</p>
          {note && <p className="fav-note" aria-hidden="true">{note}</p>}
        </div>
      </Fold>
      {confirm && (
        <Confirm tone="danger" title={t('ad.fav.deleteFolder')} text={t('ad.fav.deleteConfirm').replace('{name}', confirm.name).replace('{n}', confirm.items.length)}
          label={t('ad.fav.deleteFolder')} onYes={() => { fav.deleteFolder(confirm.id); setConfirm(null) }} onNo={() => setConfirm(null)} />
      )}
    </div>
  )
}

export default function Sidebar({ collapsed, onToggleCollapse, onSearch, onNavigate }) {
  const { t, lang, toggleLang, toggleTheme, isDark } = useApp()
  const { user: me, profile, logout } = useAuth()
  const go = useNavigate()
  const loc = useLocation()
  const [profileOpen, setProfile] = useState(false)
  const current = navFor(loc.pathname, loc.search)?.id
  const name = profile?.name || me?.email?.split('@')[0] || ''

  return (
    <>
    <aside className="adm-side" id="adm-side" aria-label={t('admin.title')}>
      <div className="adm-side-head">
        <Link to="/admin" className="adm-brand" title={t('brand')}><Logo size={26} /><span className="adm-fade"><b>{t('brand')}</b><small>{t('admin.title')}</small></span></Link>
        <button type="button" className="adm-iconbtn adm-collapse" onClick={onToggleCollapse} aria-pressed={collapsed}
          aria-label={t(collapsed ? 'ad.nav.expand' : 'ad.nav.collapse')} title={`${t(collapsed ? 'ad.nav.expand' : 'ad.nav.collapse')} (Ctrl B)`}><Icon name="panel" size={17} /></button>
      </div>

      <button type="button" className="adm-search" onClick={onSearch} aria-label={t('ad.cmd.open')} title={`${t('ad.cmd.open')} (Ctrl K)`}>
        <Icon name="search" size={15} /><span className="adm-fade">{t('ad.cmd.short')}</span><kbd className="adm-fade">Ctrl K</kbd>
      </button>

      <nav className="adm-nav" aria-label={t('admin.title')} onClick={(e) => { if (e.target.closest('a')) onNavigate?.() }}>
        {GROUPS.map((g) => <Group key={g.id} group={g} current={current} collapsed={collapsed} />)}
        <Favorites current={current} collapsed={collapsed} onExpand={onToggleCollapse} />
      </nav>

      <div className="adm-side-foot">
        <a className="adm-link" href="/" target="_blank" rel="noopener noreferrer" title={t('admin.nav.exit')}><NavIcon name="external" tone="slate" /><span className="adm-fade">{t('admin.nav.exit')}</span></a>
        <div className="adm-prefs">
          <button type="button" className="adm-iconbtn" onClick={toggleLang} aria-label={t('lang.toggle')} title={t('lang.toggle')}><Icon name="globe" size={16} /><span className="adm-fade adm-lang">{lang === 'bn' ? 'EN' : 'বাং'}</span></button>
          <button type="button" className="adm-iconbtn" onClick={toggleTheme} aria-label={t('theme.toggle')} title={t('theme.toggle')}><Icon name={isDark() ? 'sun' : 'moon'} size={16} /></button>
        </div>
        <div className="adm-account">
          <button type="button" className="adm-me" onClick={() => setProfile(true)} aria-haspopup="dialog" title={t('ad.me.open')} aria-label={`${t('ad.me.open')}: ${name}`}>
            <MonoAvatar name={name || '?'} size={28} />
            <span className="adm-fade adm-id"><strong>{name}</strong><small>{me?.email}</small></span>
          </button>
          <button type="button" className="adm-iconbtn" onClick={async () => { await logout(); go('/') }} aria-label={t('auth.logout')} title={t('auth.logout')}><Icon name="logout" size={16} /></button>
        </div>
      </div>
    </aside>
    {profileOpen && <ProfileModal onClose={() => setProfile(false)} />}
    </>
  )
}
