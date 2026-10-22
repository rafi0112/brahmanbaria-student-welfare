import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, qs } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useDebounced } from './kit.jsx'
import Icon from './icons.jsx'

// Ctrl/Cmd+K: jump to any admin section, or search students, posts, places and albums by name.
export default function CommandPalette({ onClose }) {
  const { t, pick } = useApp()
  const nav = useNavigate()
  const listId = useId()
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef(null)
  const dq = useDebounced(q.trim(), 250)

  const sections = useMemo(() => [
    ['/admin', 'dashboard', t('admin.nav.dash')], ['/admin?tab=roles', 'shield', t('admin.tab.roles')], ['/admin?tab=committee', 'star', t('admin.tab.committee')],
    ['/admin/students', 'users', t('admin.nav.students')], ['/admin/heritage', 'landmark', t('admin.nav.places')], ['/admin/blog', 'pen', t('admin.nav.blog')],
    ['/admin/gallery', 'image', t('admin.nav.gallery')], ['/admin/activity', 'clock', t('ad.nav.activity')],
    ['/admin/blog/new', 'plus', t('ad.blog.add')], ['/admin/heritage/new', 'plus', t('ad.her.add')],
  ], [t])
  const matches = dq ? sections.filter(([, , label]) => label.toLowerCase().includes(dq.toLowerCase())) : sections

  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    if (dq.length < 2) { setFound([]); return undefined }
    let live = true
    setBusy(true)
    const get = (path) => api(path).then((r) => r.items || []).catch(() => [])
    Promise.all([
      get(`/admin/students${qs({ q: dq, limit: 5 })}`), get(`/admin/content/blog${qs({ q: dq, limit: 5, status: 'all' })}`),
      get(`/admin/content/place${qs({ q: dq, limit: 5, status: 'all' })}`), get(`/admin/content/album${qs({ q: dq, limit: 3, status: 'all' })}`),
    ]).then(([students, posts, places, albums]) => {
      if (!live) return
      setFound([
        ...students.map((s) => ({ key: `s${s.id}`, group: t('admin.nav.students'), label: s.name, hint: s.email, to: `/admin/students?q=${encodeURIComponent(s.email)}` })),
        ...posts.map((p) => ({ key: `b${p.id}`, group: t('admin.nav.blog'), label: pick(p.data.titleBn, p.data.titleEn) || p.title, hint: `/${p.slug}`, to: `/admin/blog/${p.id}/edit` })),
        ...places.map((p) => ({ key: `p${p.id}`, group: t('admin.nav.places'), label: pick(p.data.nameBn, p.data.nameEn) || p.title, hint: `/${p.slug}`, to: `/admin/heritage/${p.id}/edit` })),
        ...albums.map((a) => ({ key: `a${a.id}`, group: t('ad.kind.album'), label: pick(a.data.titleBn, a.data.titleEn) || a.title, hint: '', to: `/admin/gallery?album=${a.id}` })),
      ])
    }).finally(() => live && setBusy(false))
    return () => { live = false }
  }, [dq, t, pick])

  const items = [
    ...matches.map(([to, icon, label]) => ({ key: to, group: t('ad.cmd.go'), label, icon, to })),
    ...found,
  ]
  useEffect(() => setActive(0), [dq, found.length])
  const go = (it) => { onClose(); nav(it.to) }
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); go(items[active]) }
  }
  useEffect(() => { document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }) }, [active, listId])

  return (
    <div className="modal-back ad-cmd-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-cmd" role="dialog" aria-modal="true" aria-label={t('ad.cmd.title')}>
        <div className="ad-cmd-input">
          <Icon name="search" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={t('ad.cmd.placeholder')} aria-label={t('ad.cmd.title')}
            role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={items[active] ? `${listId}-${active}` : undefined} autoComplete="off" />
          <button type="button" className="ad-x" onClick={onClose} aria-label={t('ad.close')}>×</button>
        </div>
        <ul id={listId} role="listbox" className="ad-cmd-list" aria-label={t('ad.cmd.title')}>
          {items.map((it, i) => (
            <li key={it.key} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseEnter={() => setActive(i)} onClick={() => go(it)}>
              {it.icon && <Icon name={it.icon} size={16} />}
              <span className="ad-cmd-label">{it.label}</span>
              <small className="muted">{it.hint || it.group}</small>
            </li>
          ))}
          {items.length === 0 && <li className="muted ad-cmd-none">{busy ? t('state.loading') : t('ad.cmd.none')}</li>}
        </ul>
        <p className="muted small ad-cmd-foot">{busy ? t('state.loading') : t('ad.cmd.hint')}</p>
      </div>
    </div>
  )
}
