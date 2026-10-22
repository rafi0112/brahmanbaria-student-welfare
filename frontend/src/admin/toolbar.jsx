import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { activeChips, cleanPatch, deleteView, loadViews, pageRange, saveView, viewIsActive } from '../lib/filters.js'
import Icon from './icons.jsx'
import { SearchBox } from './kit.jsx'

const store = () => { try { return window.localStorage } catch { return { getItem: () => null, setItem: () => { throw new Error('storage blocked') } } } }

function FieldInput({ field, value, onChange, idPrefix }) {
  const { t } = useApp()
  if (field.type === 'date') {
    return <input id={`${idPrefix}-${field.key}`} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
  }
  if (field.type === 'text') {
    return <input id={`${idPrefix}-${field.key}`} value={value} maxLength={100} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || field.label} />
  }
  return (
    <select id={`${idPrefix}-${field.key}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{field.all || t('ad.all')}</option>
      {field.options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  )
}

/**
 * One toolbar for every admin list: search, quick views, the main filters inline, the rest behind a "Filters" panel
 * (applied only when "Apply" is pressed), sorting, saved views, removable chips and the "Showing a–b of N" line.
 *   values / set / defaults — URL-backed filter state from useFilters
 *   fields — [{ key, label, type: 'select'|'text'|'date', options, all, advanced }]
 *   views  — quick views [{ id, label, patch }] shown as tabs
 *   sorts  — [[value, label]] for the sort key (omit for no sorting)
 */
export default function ListToolbar({ section, values, set, defaults = {}, search, fields = [], views = [], sorts, total, loading, extra }) {
  const { t, n } = useApp()
  const { user } = useAuth()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({})
  const [saved, setSaved] = useState(() => loadViews(store(), user?.id, section))
  const [menu, setMenu] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const panel = useRef(null)
  const [leaving, setLeaving] = useState(null)
  const removeChip = (key) => { setLeaving(key); setTimeout(() => { set({ [key]: defaults[key] ?? '' }); setLeaving(null) }, 120) }
  const inline = fields.filter((f) => !f.advanced)
  const advanced = fields.filter((f) => f.advanced)
  const filterKeys = useMemo(() => [...fields.map((f) => f.key), ...views.flatMap((v) => Object.keys(v.patch)), ...(search ? [search.key || 'q'] : [])], [fields, views, search])
  const uniqueKeys = [...new Set(filterKeys)]
  const chips = activeChips(values, defaults, fields, search?.key || 'q', t('ad.tb.search'))
  const advancedActive = advanced.filter((f) => values[f.key] && values[f.key] !== (defaults[f.key] ?? '')).length
  const { from, to } = pageRange(values.page, values.limit, total)

  useEffect(() => { setSaved(loadViews(store(), user?.id, section)) }, [user?.id, section])
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    const onDown = (e) => { if (panel.current && !panel.current.contains(e.target)) setOpen(false) }
    addEventListener('keydown', onKey)
    addEventListener('mousedown', onDown)
    return () => { removeEventListener('keydown', onKey); removeEventListener('mousedown', onDown) }
  }, [open])

  const clearAll = () => set(Object.fromEntries(uniqueKeys.map((k) => [k, defaults[k] ?? ''])))
  const openPanel = () => { setDraft(Object.fromEntries(advanced.map((f) => [f.key, values[f.key] || '']))); setOpen(!open) }
  const apply = () => { set(draft); setOpen(false) }
  const reset = () => setDraft(Object.fromEntries(advanced.map((f) => [f.key, defaults[f.key] ?? ''])))
  const dirtyDraft = advanced.some((f) => (draft[f.key] || '') !== (values[f.key] || ''))

  const applySaved = (v) => { set({ ...Object.fromEntries(uniqueKeys.map((k) => [k, defaults[k] ?? ''])), ...v.patch }); setMenu(false) }
  const submitSave = (e) => {
    e.preventDefault()
    const r = saveView(store(), user?.id, section, name, cleanPatch(values, uniqueKeys.filter((k) => !['page', 'limit'].includes(k))))
    if (r.ok) { setSaved(r.views); setNaming(false); setName(''); setMsg(t('ad.tb.savedView')) } else setMsg(t(`ad.tb.saveFail.${r.reason}`))
  }

  return (
    <div className="ad-toolbar2" role="search" aria-label={t('ad.tb.label')}>
      <div className="ad-tb-row">
        {search && (
          <div className="ad-searchbox">
            <Icon name="search" />
            <SearchBox value={values[search.key || 'q']} onChange={(v) => set({ [search.key || 'q']: v })} placeholder={search.placeholder} />
          </div>
        )}
        {views.length > 0 && (
          <div className="ad-views" role="group" aria-label={t('ad.tb.views')}>
            {views.map((v) => {
              const on = viewIsActive(v, values)
              return <button key={v.id} type="button" className={`ad-view ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ ...Object.fromEntries(Object.keys(v.patch).map((k) => [k, ''])), ...v.patch })}>{v.label}</button>
            })}
          </div>
        )}
        {extra && <div className="ad-tb-extra">{extra}</div>}
      </div>

      <div className="ad-tb-row ad-tb-fields">
        {inline.map((f) => (
          <label key={f.key} className="ad-tb-field"><span className="sr-only">{f.label}</span>
            <FieldInput field={{ ...f, all: f.all || `${f.label}` }} value={values[f.key]} onChange={(v) => set({ [f.key]: v })} idPrefix={id} /></label>
        ))}
        {advanced.length > 0 && (
          <div className="ad-pop" ref={panel}>
            <button type="button" className="btn btn-outline btn-sm" aria-expanded={open} aria-controls={`${id}-panel`} onClick={openPanel}>
              <Icon name="filter" size={16} /> {t('ad.tb.filters')}{advancedActive > 0 && <span className="ad-count-badge">{n(advancedActive)}</span>}
            </button>
            {open && (
              <div id={`${id}-panel`} className="ad-panel" role="group" aria-label={t('ad.tb.filters')}>
                <div className="ad-panel-grid">
                  {advanced.map((f) => (
                    <label key={f.key} className="ad-panel-field"><span>{f.label}</span>
                      <FieldInput field={f} value={draft[f.key] || ''} onChange={(v) => setDraft({ ...draft, [f.key]: v })} idPrefix={`${id}-d`} /></label>
                  ))}
                </div>
                <div className="row">
                  <button type="button" className="btn btn-dark btn-sm" onClick={apply} disabled={!dirtyDraft}>{t('ad.tb.apply')}</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>{t('ad.tb.reset')}</button>
                  <span className="muted small">{dirtyDraft ? t('ad.tb.notApplied') : t('ad.tb.applied')}</span>
                </div>
              </div>
            )}
          </div>
        )}
        {sorts && (
          <label className="ad-tb-field"><span className="sr-only">{t('ad.sort')}</span>
            <select value={values.sort} onChange={(e) => set({ sort: e.target.value })} aria-label={t('ad.sort')}>
              {sorts.map(([v, label]) => <option key={v} value={v}>{t('ad.sort')}: {label}</option>)}
            </select></label>
        )}
        <div className="ad-pop ad-pop-right">
          <button type="button" className="btn btn-outline btn-sm" aria-expanded={menu} onClick={() => { setMenu(!menu); setMsg('') }}>
            <Icon name="bookmark" size={16} /> {t('ad.tb.saved')}{saved.length > 0 && <span className="ad-count-badge">{n(saved.length)}</span>}
          </button>
          {menu && (
            <div className="ad-panel ad-panel-right">
              {saved.length === 0 && <p className="muted small">{t('ad.tb.noSaved')}</p>}
              <ul className="ad-saved">
                {saved.map((v) => (
                  <li key={v.id}>
                    <button type="button" className="ad-saved-apply" onClick={() => applySaved(v)}>{v.name}</button>
                    <button type="button" className="ad-x" aria-label={`${t('ad.tb.deleteView')} ${v.name}`} onClick={() => setSaved(deleteView(store(), user?.id, section, v.id))}>×</button>
                  </li>
                ))}
              </ul>
              {naming ? (
                <form onSubmit={submitSave} className="row">
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={t('ad.tb.viewName')} aria-label={t('ad.tb.viewName')} autoFocus />
                  <button className="btn btn-dark btn-sm">{t('ad.save')}</button>
                </form>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" disabled={chips.length === 0} title={chips.length === 0 ? t('ad.tb.nothingToSave') : undefined} onClick={() => { setNaming(true); setMsg('') }}>+ {t('ad.tb.saveCurrent')}</button>
              )}
              {msg && <p className="muted small" role="status">{msg}</p>}
            </div>
          )}
        </div>
        {chips.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>{t('common.clear')}</button>}
      </div>

      {chips.length > 0 && (
        <ul className="ad-chips" aria-label={t('ad.tb.active')}>
          {chips.map((c) => (
            <li key={c.key} className={`ad-chip ${leaving === c.key ? 'is-leaving' : ''}`}><span><b>{c.label}:</b> {c.text}</span>
              <button type="button" aria-label={`${t('ad.tb.remove')} ${c.label}`} onClick={() => removeChip(c.key)}><Icon name="x" size={12} /></button></li>
          ))}
        </ul>
      )}
      <p className="ad-showing muted small" aria-live="polite">
        {loading ? t('state.loading') : total ? `${t('ad.tb.showing')} ${n(from)}–${n(to)} ${t('ad.tb.of')} ${n(total)}` : t('ad.tb.none')}
      </p>
    </div>
  )
}
