import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useApi, qs, usePhoto } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useBase } from '../lib/base.js'
import { Badge, Crumbs, Data, Empty, Pagination, PageHero, VerifiedMark, initials } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import Reveal from '../components/Reveal.jsx'
import { StudentCard } from '../components/cards.jsx'

function useDebounced(v, ms = 250) {
  const [d, setD] = useState(v)
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id) }, [v, ms])
  return d
}

// which sentence explains what this viewer can see (the API decides; this only words it)
function useViewNote(view) {
  const { t } = useApp()
  const { user } = useAuth()
  const text = view === 'admin' ? 'students.viewAdmin' : view === 'member' ? 'students.viewMember' : user ? 'students.viewPending' : 'students.viewPublic'
  return { text: t(text), askSignIn: view === 'public' && !user }
}

export default function Students() {
  const { t, n, pick } = useApp()
  const { user } = useAuth()
  const [sp, setSp] = useSearchParams()
  const f = { q: sp.get('q') || '', batch: sp.get('batch') || '', department: sp.get('department') || '', upazila: sp.get('upazila') || '', page: Number(sp.get('page')) || 1 }
  const [text, setText] = useState(f.q)
  const dq = useDebounced(text)
  useEffect(() => { if (dq !== f.q) set({ q: dq, page: 1 }) /* eslint-disable-line */ }, [dq])

  const set = (patch) => {
    const next = { ...f, ...patch }
    const out = {}
    Object.entries(next).forEach(([k, v]) => { if (v && !(k === 'page' && v === 1)) out[k] = v })
    setSp(out, { replace: true })
  }
  const res = useApi(`/students${qs({ ...f, page: f.page, limit: 12 })}`)
  const ups = useApi('/upazilas')
  const upazilas = ups.data?.items || []
  const facets = res.data?.facets
  const note = useViewNote(res.data?.view)
  const places = [...upazilas].filter((u) => u.members > 0).sort((a, b) => b.members - a.members)

  return (
    <>
      <PageHero kicker={t('students.kicker')} title={t('students.title')} variant="bleed" lede={t('students.lede')} src="/images/bswa/river.webp" script={pick('আজকের শিক্ষার্থী, আগামীর ব্রাহ্মণবাড়িয়া', 'Students today, stronger Brahmanbaria tomorrow')} />
      <div className="wrap">
        <form className="sbar" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: text.trim(), page: 1 }) }}>
          <label className="sbar-q">
            <Icon name="search" size={18} />
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('students.search')} aria-label={t('students.search')} />
          </label>
          <div className="sbar-filters">
            <select value={f.batch} onChange={(e) => set({ batch: e.target.value, page: 1 })} aria-label={t('students.batch')}>
              <option value="">{t('students.allBatches')}</option>
              {Object.keys(facets?.batches || {}).sort((a, b) => b - a).map((b) => <option key={b} value={b}>{t('students.batch')} {n(b)} ({n(facets.batches[b])})</option>)}
            </select>
            <select value={f.department} onChange={(e) => set({ department: e.target.value, page: 1 })} aria-label={t('students.dept')}>
              <option value="">{t('students.allDepts')}</option>
              {Object.keys(facets?.departments || {}).filter(Boolean).sort().map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={f.upazila} onChange={(e) => set({ upazila: e.target.value, page: 1 })} aria-label={t('students.from')}>
              <option value="">{t('students.allUpazilas')}</option>
              {upazilas.map((u) => <option key={u.slug} value={u.slug}>{pick(u.nameBn, u.nameEn)}</option>)}
            </select>
            {(f.q || f.batch || f.department || f.upazila) && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setText(''); setSp({}, { replace: true }) }}>{t('common.clear')}</button>}
          </div>
          <button className="btn btn-dark sbar-go" type="submit">{t('hero.searchBtn')} <Icon name="arrow" size={16} className="arr" /></button>
        </form>
      </div>
      <section className="section wrap dir">
        <div className="dir-main">
          <p className="privacy-note" role="status">
            <Icon name={res.data?.view === 'public' ? 'lock' : 'users'} size={16} />
            {note.text}
            {note.askSignIn && <Link className="link-arrow" to="/login">{t('students.signInMore')}</Link>}
            {res.data?.sample && <Badge tone="gold">{t('students.sample')}</Badge>}
          </p>
          <Data q={res} skeleton="people">
            {(d) => (
              <>
                <p className="muted result-count" aria-live="polite">{n(d.total)} {t('students.found')}</p>
                {d.items.length === 0 ? <Empty /> : <div className="student-grid">{d.items.map((s, i) => <Reveal key={s.id} delay={(i % 3) * 50}><StudentCard s={s} upazilas={upazilas} /></Reveal>)}</div>}
                <Pagination page={d.page} pages={d.pages} onPage={(p) => set({ page: p })} />
              </>
            )}
          </Data>
        </div>

        <aside className="dir-aside" aria-label={t('students.quickLinks')}>
          <div className="join-card">
            <Icon name="users" size={26} />
            <h2>{t(user ? 'students.yourProfile' : 'students.joinTitle')}</h2>
            <p>{t(user ? 'students.yourProfileBody' : 'students.joinBody')}</p>
            <Link className="btn btn-light btn-sm" to={user ? (user.role === 'admin' ? '/admin' : '/dashboard') : '/register'}>{t(user ? 'auth.account' : 'students.joinCta')} <Icon name="arrow" size={15} className="arr" /></Link>
          </div>
          {places.length > 0 && (
            <div className="aside-card">
              <h2>{t('students.byLocation')}</h2>
              <ul className="loc-list">
                {places.map((u) => (
                  <li key={u.slug}>
                    <button type="button" className={f.upazila === u.slug ? 'on' : ''} onClick={() => set({ upazila: f.upazila === u.slug ? '' : u.slug, page: 1 })} aria-pressed={f.upazila === u.slug}>
                      <span>{pick(u.nameBn, u.nameEn).replace(' উপজেলা', '').replace(' Upazila', '')}</span><b className="num">{n(u.members)}</b>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="aside-card">
            <h2>{t('students.quickLinks')}</h2>
            <ul className="quick-links">
              {[['/alumni', 'nav.alumni', 'users'], ['/committee', 'nav.committee', 'landmark'], ['/events', 'nav.events', 'calendar'], ['/contact', 'nav.contact', 'mail']].map(([to, k, ic]) => (
                <li key={to}><Link to={to}><span className="ql-ico"><Icon name={ic} size={16} /></span>{t(k)}<Icon name="arrow" size={14} className="arr" /></Link></li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </>
  )
}

function SpAvatar({ name, photo }) {
  const src = usePhoto(photo)
  return <span className="sp-avatar" aria-hidden="true">{src ? <img src={src} alt="" /> : initials(name)}</span>
}

export function StudentDetail() {
  const base = useBase()
  const { id } = useParams()
  const { t, n, pick } = useApp()
  const res = useApi(`/students/${id}`)
  const ups = useApi('/upazilas')
  const note = useViewNote(res.data?.view)
  return (
    <Data q={res} skeleton="detail">
      {(s) => {
        const d = s.details
        const up = (ups.data?.items || []).find((u) => u.slug === s.upazila)
        const upName = up ? pick(up.nameBn, up.nameEn) : ''
        const registered = d?.source === 'member'
        const rows = (list) => list.filter(([, v]) => v)
        const academics = rows([[t('students.dept'), s.department], [t('students.batch'), s.batch ? n(s.batch) : ''], [t('students.session'), d?.session]])
        const where = rows([[t('students.from'), up ? <Link key="u" to={`/students?upazila=${up.slug}`}>{upName}</Link> : ''], [t('students.union'), d?.union]])
        const contact = d ? rows([
          [t('students.phone'), d.phone && <a key="p" href={`tel:${d.phone}`}>{d.phone}</a>],
          [t('students.email'), d.email && <a key="e" href={`mailto:${d.email}`}>{d.email}</a>],
          [t('students.blood'), d.bloodGroup],
          [t('students.gender'), d.gender ? t(`ad.mem.${d.gender}`) : ''],
        ]) : []
        return (
          <article className="sprofile">
            <div className="wrap sp-crumbs"><Crumbs items={[{ to: '/', label: t('nav.home') }, { to: `${base}/students`, label: t('nav.students') }, { label: s.name }]} /></div>
            <div className="sp-cover" aria-hidden="true">
              <img src="/images/bswa/hero-1672.webp" srcSet="/images/bswa/hero-1000.webp 1000w, /images/bswa/hero-1672.webp 1672w" sizes="100vw" alt="" width="1672" height="941" />
            </div>
            <div className="wrap sp-head">
              <SpAvatar name={s.name} photo={d?.photoUrl} />
              <div className="sp-id">
                <h1>{s.name}{s.verified && <VerifiedMark size={22} />}</h1>
                <ul className="sp-chips">
                  {s.department && <li>{s.department}</li>}
                  {s.batch && <li>{t('students.batch')} {n(s.batch)}</li>}
                  {upName && <li><Icon name="pin" size={14} /> {upName}</li>}
                  {d && <li className={registered ? 'is-teal' : ''}>{registered ? t('students.registeredMember') : t('students.directoryRecord')}</li>}
                </ul>
              </div>
              <Link className="btn btn-outline btn-sm sp-back" to={`${base}/students`}><Icon name="arrow" size={15} className="arr flip" /> {t('students.back')}</Link>
            </div>

            <nav className="wrap pnav" aria-label={t('students.profile')}>
              <a href="#overview">{t('students.overview')}</a>
              <a href="#academics">{t('students.academics')}</a>
              {d && <a href="#contact">{t('students.contactH')}</a>}
            </nav>

            <div className="wrap sp-body">
              <div className="sp-main">
                <section id="overview" className="sp-sec">
                  <h2>{t('students.overview')}</h2>
                  <p className="sp-lede">{[s.department, s.batch ? `${t('students.batch')} ${n(s.batch)}` : '', upName].filter(Boolean).join(' · ')}</p>
                  <p className="privacy-note" role="status">
                    <Icon name={s.view === 'public' ? 'lock' : 'users'} size={16} />
                    {note.text}
                    {note.askSignIn && <Link className="link-arrow" to="/login">{t('students.signInMore')}</Link>}
                  </p>
                </section>
                <section id="academics" className="sp-sec">
                  <h2>{t('students.academics')}</h2>
                  <dl className="sp-facts">
                    {academics.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                    {where.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                  </dl>
                </section>
                {d ? (
                  <section id="contact" className="sp-sec">
                    <h2>{t('students.contactH')}</h2>
                    {contact.length > 0 ? (
                      <dl className="sp-facts">{contact.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
                    ) : <p className="muted">{t(registered ? 'students.nothingShared' : 'students.noContactForRecord')}</p>}
                    {!registered && s.view !== 'admin' && contact.length > 0 && <p className="muted small">{t('students.noContactForRecord')}</p>}
                    {d.status && <p className="muted small">{t('students.accountStatus')}: <Badge tone={d.status === 'approved' ? 'leaf' : 'gold'}>{t(`admin.${d.status}`)}</Badge></p>}
                  </section>
                ) : null}
              </div>
              <aside className="sp-side">
                <div className="sp-place">
                  <div className="sp-place-img"><img src="/images/bswa/river.webp" alt="" width="740" height="421" loading="lazy" decoding="async" /></div>
                  <p className="kicker">{t('students.from')}</p>
                  <h3>{upName || '—'}</h3>
                  {up && <Link className="link-arrow" to={`/directory/${up.slug}`}>{t('dir.view')} <Icon name="arrow" size={15} className="arr" /></Link>}
                  {up && <Link className="link-arrow" to={`/students?upazila=${up.slug}`}>{t('dir.studentsFrom')} <Icon name="arrow" size={15} className="arr" /></Link>}
                </div>
              </aside>
            </div>
          </article>
        )
      }}
    </Data>
  )
}
