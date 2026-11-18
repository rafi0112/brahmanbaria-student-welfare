import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useApi, qs } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useBase } from '../lib/base.js'
import { Badge, BatchGroups, Crumbs, Data, Empty, Pagination, PageHero, VerifiedMark } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import SpAvatar from '../components/SpAvatar.jsx'
import ProfileDialog from '../components/ProfileDialog.jsx'
import { useProfileParam } from '../lib/profileParam.js'
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
  const [sp, setSp] = useSearchParams()
  const [profile, openProfile, closeProfile] = useProfileParam()
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
  const res = useApi(`/students${qs({ ...f, page: f.page, limit: 40 })}`)
  const ups = useApi('/upazilas')
  const upazilas = ups.data?.items || []
  const facets = res.data?.facets
  const note = useViewNote(res.data?.view)

  return (
    <>
      {profile && <ProfileDialog label={t('students.profile2')} onClose={closeProfile}><StudentDetail id={profile} modal /></ProfileDialog>}
      <PageHero page="students" kicker={t('students.kicker')} title={t('students.title')} variant="bleed" lede={t('students.lede')} src="/images/bswa/river.webp" script={t('students.studentsTodayStrongerBrahmanbaria')} />
      <div className="wrap">
        <form className="sbar" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: text.trim(), page: 1 }) }}>
          <label className="sbar-q">
            <Icon name="search" size={18} />
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={res.data?.view && res.data.view !== 'public' ? t('students.nameDepartmentBloodGroup') : t('students.search')} aria-label={t('students.search')} />
          </label>
          <div className="sbar-filters">
            <select value={f.batch} onChange={(e) => set({ batch: e.target.value, page: 1 })} aria-label={t('students.batch')}>
              <option value="">{t('students.allBatches')}</option>
              {Object.keys(facets?.batches || {}).sort((a, b) => a - b).map((b) => <option key={b} value={b}>{t('students.batch')} {n(b)} ({n(facets.batches[b])})</option>)}
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
                <p className="muted result-count" aria-live="polite">{n(d.total)} {t('students.found')}
                  {d.alumniUpToBatch > 0 && <> · {t('students.fromBatch').replace('{n}', n(d.alumniUpToBatch + 1))} <Link className="link-arrow" to="/alumni">{t('students.earlierAlumni').replace('{n}', n(d.alumniUpToBatch))} →</Link></>}</p>
                {d.items.length === 0 ? <Empty /> : (
                  <BatchGroups items={d.items} sessions={d.facets?.batchSessions} counts={!f.q && !f.department && !f.upazila ? d.facets?.batches : null} gridClass="student-grid">
                    {(s, i) => <Reveal key={s.id} delay={(i % 3) * 50}><StudentCard s={s} upazilas={upazilas} onOpen={openProfile} /></Reveal>}
                  </BatchGroups>
                )}
                <Pagination page={d.page} pages={d.pages} onPage={(p) => set({ page: p })} />
              </>
            )}
          </Data>
        </div>
      </section>
    </>
  )
}

export function StudentDetail({ id: idProp, modal = false }) {
  const base = useBase()
  const params = useParams()
  const id = idProp || params.id
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
          [t('students.blood'), d.bloodGroup && <b key="b" className="blood-txt">{d.bloodGroup}</b>],
          [t('students.gender'), d.gender ? t(`ad.mem.${d.gender}`) : ''],
        ]) : []
        return (
          <article className={`sprofile${modal ? ' is-modal' : ''}`}>
            {!modal && <div className="wrap sp-crumbs"><Crumbs items={[{ to: '/', label: t('nav.home') }, { to: `${base}/students`, label: t('nav.students') }, { label: s.name }]} /></div>}
            {!modal && (
              <div className="sp-cover" aria-hidden="true">
                <img src="/images/bswa/hero-1672.webp" srcSet="/images/bswa/hero-1000.webp 1000w, /images/bswa/hero-1672.webp 1672w" sizes="100vw" alt="" width="1672" height="941" />
              </div>
            )}
            {modal && <div className="pm-cover" aria-hidden="true" />}
            <div className={modal ? 'sp-head' : 'wrap sp-head'}>
              <SpAvatar name={s.name} photo={s.photo || d?.photoUrl} />
              <div className="sp-id">
                <h1>{s.name}{s.verified && <VerifiedMark size={22} />}</h1>
                <ul className="sp-chips">
                  {s.department && <li>{s.department}</li>}
                  {s.batch && <li>{t('students.batch')} {n(s.batch)}</li>}
                  {upName && <li><Icon name="pin" size={14} /> {upName}</li>}
                  {d && <li className={registered ? 'is-teal' : ''}>{registered ? t('students.registeredMember') : t('students.directoryRecord')}</li>}
                </ul>
              </div>
              {!modal && <Link className="btn btn-outline btn-sm sp-back" to={`${base}/students`}><Icon name="arrow" size={15} className="arr flip" /> {t('students.back')}</Link>}
            </div>

            {!modal && <nav className="wrap pnav" aria-label={t('students.profile')}>
              <a href="#overview">{t('students.overview')}</a>
              <a href="#academics">{t('students.academics')}</a>
              {d && <a href="#contact">{t('students.contactH')}</a>}
              {d?.record && Object.keys(d.record).length > 0 && <a href="#record">{t('students.recordH')}</a>}
            </nav>}

            <div className={modal ? 'sp-body' : 'wrap sp-body'}>
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
                {d?.record && Object.keys(d.record).length > 0 && (
                  <section id="record" className="sp-sec sp-record">
                    <h2>{t('students.recordH')}</h2>
                    <p className="muted small"><Icon name="lock" size={14} /> {t('students.recordNote')}</p>
                    <dl className="sp-facts">
                      {['permanentAddress', 'presentAddress', 'school', 'college', 'facebook', 'photoLink', 'note'].filter((k) => d.record[k]).map((k) => (
                        <div key={k}><dt>{t(`students.rec.${k}`)}</dt>
                          <dd>{/^https?:\/\//.test(d.record[k]) ? <a href={d.record[k]} rel="noreferrer noopener">{k === 'photoLink' ? t('students.rec.openPhoto') : d.record[k]}</a> : d.record[k]}</dd></div>
                      ))}
                    </dl>
                  </section>
                )}
              </div>
              {!modal && <aside className="sp-side">
                <div className="sp-place">
                  <div className="sp-place-img"><img src="/images/bswa/river.webp" alt="" width="740" height="421" loading="lazy" decoding="async" /></div>
                  <p className="kicker">{t('students.from')}</p>
                  <h3>{upName || '—'}</h3>
                  {up && <Link className="link-arrow" to={`/directory/${up.slug}`}>{t('dir.view')} <Icon name="arrow" size={15} className="arr" /></Link>}
                  {up && <Link className="link-arrow" to={`/students?upazila=${up.slug}`}>{t('dir.studentsFrom')} <Icon name="arrow" size={15} className="arr" /></Link>}
                </div>
              </aside>}
            </div>
          </article>
        )
      }}
    </Data>
  )
}
