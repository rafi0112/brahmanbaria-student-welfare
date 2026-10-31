import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi, qs } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import Icon from './Icon.jsx'

const RECENT_KEY = 'jk-recent-search'
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 5) } catch { return [] } }
const saveRecent = (q) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...readRecent().filter((x) => x !== q)].slice(0, 5))) } catch { /* private mode */ } }

const norm = (v) => (v || '').toString().toLowerCase()
const hit = (q, ...fields) => fields.some((f) => norm(f).includes(q))

function useDebounced(v, ms = 220) {
  const [d, setD] = useState(v)
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id) }, [v, ms])
  return d
}

// Site search in a dialog: pages, students (searched on the server), heritage places, upazilas, events and articles
// (filtered here). Before typing it offers recent searches, the nine upazilas and the main pages. Arrow keys move,
// Enter opens, Escape closes; with nothing matched, Enter searches the student directory.
export default function SearchDialog({ onClose }) {
  const { t, pick, n } = useApp()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [recent, setRecent] = useState(readRecent)
  const input = useRef(null)
  const list = useRef(null)
  const dq = useDebounced(q.trim())
  const needle = norm(q.trim())

  const places = useApi('/heritage')
  const upazilas = useApi('/upazilas')
  const events = useApi('/events')
  const posts = useApi('/blog')
  const students = useApi(dq.length >= 2 ? `/students${qs({ q: dq, limit: 5 })}` : null)

  useEffect(() => {
    input.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const pages = useMemo(() => [
    ['/', t('nav.home')], ['/about', t('nav.about')], ['/students', t('nav.students')], ['/events', t('nav.events')],
    ['/alumni', t('nav.alumni')], ['/committee', t('nav.committee')], ['/heritage', t('nav.heritage')], ['/directory', t('footer.upazilas')],
    ['/gallery', t('nav.gallery')], ['/blog', t('nav.blog')], ['/help', t('nav.help')],
  ], [t])

  // grouped results; each item: { key, to, title, sub, icon, img }
  const groups = useMemo(() => {
    if (!needle) return []
    const g = []
    const add = (id, label, items) => { if (items.length) g.push({ id, label, items }) }
    add('pages', pick('পেজ', 'Pages'), pages.filter(([, l]) => norm(l).includes(needle)).slice(0, 4)
      .map(([to, l]) => ({ key: `p${to}`, to, title: l, sub: to, icon: 'arrow' })))
    add('students', pick('শিক্ষার্থী', 'Students'), (students.data?.items || []).slice(0, 5)
      .map((s) => ({ key: `s${s.id}`, to: `/students/${s.id}`, title: s.name, sub: [s.department, s.batch && `${pick('ব্যাচ', 'Batch')} ${n(s.batch)}`].filter(Boolean).join(' · '), icon: 'users' })))
    add('places', pick('ঐতিহ্য', 'Heritage'), (places.data?.items || []).filter((p) => hit(needle, p.nameBn, p.nameEn, p.summary, p.upazila, p.category)).slice(0, 4)
      .map((p) => ({ key: `h${p.slug}`, to: `/heritage/${p.slug}`, title: pick(p.nameBn, p.nameEn), sub: pick(p.nameEn, p.nameBn), icon: 'landmark', img: p.images?.[0] && `/images/${p.images[0]}-640.webp` })))
    add('upazilas', pick('উপজেলা', 'Upazilas'), (upazilas.data?.items || []).filter((u) => hit(needle, u.nameBn, u.nameEn, u.slug, ...(u.unions || []))).slice(0, 4)
      .map((u) => ({ key: `u${u.slug}`, to: `/directory/${u.slug}`, title: pick(u.nameBn, u.nameEn), sub: `${n(u.unions?.length || 0)} ${pick('ইউনিয়ন', 'unions')}`, icon: 'pin' })))
    add('events', pick('ইভেন্ট', 'Events'), (events.data?.items || []).filter((e) => hit(needle, e.titleBn, e.titleEn, e.venue, e.summaryBn, e.summaryEn)).slice(0, 4)
      .map((e) => ({ key: `e${e.slug}`, to: `/events/${e.slug}`, title: pick(e.titleBn || e.titleEn, e.titleEn || e.titleBn), sub: [e.date, e.venue].filter(Boolean).join(' · '), icon: 'calendar' })))
    add('posts', pick('লেখা', 'Articles'), (posts.data?.items || []).filter((p) => hit(needle, p.title, p.titleBn, p.titleEn, p.summary)).slice(0, 3)
      .map((p) => ({ key: `b${p.slug}`, to: `/blog/${p.slug}`, title: p.title || pick(p.titleBn, p.titleEn), sub: p.summary, icon: 'book' })))
    return g
  }, [needle, pages, students.data, places.data, upazilas.data, events.data, posts.data, pick, n])

  const flat = groups.flatMap((g) => g.items)
  useEffect(() => { setActive(0) }, [needle])
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [active])

  const open = (to) => {
    if (needle) { saveRecent(q.trim()); setRecent(readRecent()) }
    onClose()
    nav(to)
  }
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown' && flat.length) { e.preventDefault(); setActive((a) => (a + 1) % flat.length) }
    else if (e.key === 'ArrowUp' && flat.length) { e.preventDefault(); setActive((a) => (a - 1 + flat.length) % flat.length) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (flat[active]) open(flat[active].to)
      else if (needle) open(`/students${qs({ q: q.trim() })}`)
    }
  }
  const searching = needle && (students.loading || places.loading || upazilas.loading || events.loading)
  let idx = -1

  return (
    <div className="sd" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sd-panel" role="dialog" aria-modal="true" aria-label={t('common.search')} onKeyDown={onKey}>
        <div className="sd-field">
          <Icon name="search" size={20} />
          <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('শিক্ষার্থী, স্থান, উপজেলা, ইভেন্ট খুঁজুন…', 'Search students, places, upazilas, events…')}
            role="combobox" aria-expanded={flat.length > 0} aria-controls="sd-list" aria-activedescendant={flat[active] ? `sd-${flat[active].key}` : undefined} aria-autocomplete="list" />
          <button type="button" className="sd-esc" onClick={onClose} aria-label={pick('বন্ধ করুন', 'Close')}>Esc</button>
        </div>

        <div className="sd-body" ref={list}>
          {!needle && (
            <div className="sd-suggest">
              {recent.length > 0 && (
                <section>
                  <h3>{pick('সাম্প্রতিক খোঁজ', 'Recent searches')}</h3>
                  <div className="sd-chips">{recent.map((r) => <button key={r} type="button" onClick={() => { setQ(r); input.current?.focus() }}><Icon name="clock" size={13} />{r}</button>)}</div>
                </section>
              )}
              {(upazilas.data?.items || []).length > 0 && <section>
                <h3>{pick('উপজেলা', 'Upazilas')}</h3>
                <div className="sd-chips">{(upazilas.data?.items || []).map((u) => <button key={u.slug} type="button" onClick={() => open(`/directory/${u.slug}`)}><Icon name="pin" size={13} />{pick(u.nameBn, u.nameEn).replace(' উপজেলা', '').replace(' Upazila', '')}</button>)}</div>
              </section>}
              <section>
                <h3>{pick('দ্রুত যান', 'Go to')}</h3>
                <div className="sd-pages">{pages.slice(1).map(([to, l]) => <button key={to} type="button" onClick={() => open(to)}>{l}<Icon name="arrow" size={13} /></button>)}</div>
              </section>
            </div>
          )}

          {needle && (
            <ul id="sd-list" role="listbox" className="sd-results" aria-label={t('common.search')}>
              {groups.map((g) => (
                <li key={g.id} role="presentation">
                  <p className="sd-group" role="presentation">{g.label}</p>
                  <ul role="presentation">
                    {g.items.map((it) => {
                      idx += 1
                      const me = idx
                      return (
                        <li key={it.key} id={`sd-${it.key}`} role="option" aria-selected={me === active} className={me === active ? 'is-on' : undefined}
                          onMouseMove={() => setActive(me)} onClick={() => open(it.to)}>
                          <span className="sd-ico" aria-hidden="true">{it.img ? <img src={it.img} alt="" loading="lazy" onError={(e) => { e.currentTarget.remove() }} /> : <Icon name={it.icon} size={16} />}</span>
                          <span className="sd-txt"><b>{it.title}</b>{it.sub && <small>{it.sub}</small>}</span>
                          <Icon name="arrow" size={14} className="sd-go" />
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
              {!searching && flat.length === 0 && (
                <li className="sd-empty" role="presentation">
                  <p>{pick(`"${q.trim()}" — কিছু পাওয়া যায়নি।`, `No match for "${q.trim()}".`)}</p>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => open(`/students${qs({ q: q.trim() })}`)}>{pick('শিক্ষার্থী ডিরেক্টরিতে খুঁজুন', 'Search the student directory')} <Icon name="arrow" size={14} /></button>
                </li>
              )}
              {searching && flat.length === 0 && <li className="sd-empty" role="presentation"><p>{pick('খোঁজা হচ্ছে…', 'Searching…')}</p></li>}
            </ul>
          )}
        </div>

        <p className="sd-foot" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> {pick('বাছাই', 'move')} <kbd>Enter</kbd> {pick('খুলুন', 'open')} <kbd>Esc</kbd> {pick('বন্ধ', 'close')}</p>
      </div>
    </div>
  )
}
