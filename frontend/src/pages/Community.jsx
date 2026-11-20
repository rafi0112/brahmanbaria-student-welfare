import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useApi, usePhoto, qs } from '../lib/api.js'
import { initials } from '../lib/initials.js'
import { useApp } from '../lib/app.jsx'
import { Avatar, BatchGroups, Data, Empty, PageHero, Pagination, VerifiedMark } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import ProfileDialog from '../components/ProfileDialog.jsx'
import SpAvatar from '../components/SpAvatar.jsx'
import PhotoViewer from '../components/PhotoViewer.jsx'
import { useProfileParam } from '../lib/profileParam.js'

/* ---------------- Alumni ---------------- */
function useDebounced(v, ms = 250) {
  const [d, setD] = useState(v)
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id) }, [v, ms])
  return d
}

// An alumnus in a dialog over the list: everything the list already has about them, larger, with their photo to view bigger.
export function AlumniProfile({ a, view }) {
  const { t, n, pick } = useApp()
  const role = [...new Set([a.designation, a.occupation].filter(Boolean))].join(' · ')
  const facts = [[t('students.dept'), a.department], [t('students.batch'), a.batch ? n(a.batch) : ''], [t('alumni.occupation'), a.occupation], [t('alumni.workplace'), a.workplace]].filter(([, v]) => v)
  return (
    <article className="sprofile is-modal">
      <div className="pm-cover" aria-hidden="true" />
      <div className="sp-head">
        <SpAvatar name={a.name} photo={a.photo} />
        <div className="sp-id">
          <h1>{a.name}</h1>
          <ul className="sp-chips">
            {role && <li>{role}</li>}
            {a.department && <li>{a.department}</li>}
            {a.batch ? <li>{t('students.batch')} {n(a.batch)}</li> : null}
          </ul>
        </div>
      </div>
      <div className="sp-body">
        <div className="sp-main">
          <section className="sp-sec">
            <dl className="sp-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </section>
          {view === 'public' ? (
            <section className="sp-sec">
              <p className="privacy-note" role="status">
                <Icon name="lock" size={16} />
                {t('alumni.occupationWorkplaceAndContact')}
                <Link className="link-arrow" to="/login">{t('students.signInMore')}</Link>
              </p>
            </section>
          ) : (
            <section className="sp-sec">
              <h2>{t('students.contactH')}</h2>
              {a.contact ? (
                <dl className="sp-facts">
                  {a.contact.phone && <div><dt>{t('students.phone')}</dt><dd><a href={`tel:${a.contact.phone.replace(/[^\d+]/g, '')}`}>{a.contact.phone}</a></dd></div>}
                  {a.contact.email && <div><dt>{t('students.email')}</dt><dd><a href={`mailto:${a.contact.email}`}>{a.contact.email}</a></dd></div>}
                  {a.contact.bloodGroup && <div><dt>{t('students.blood')}</dt><dd><b className="blood-txt">{a.contact.bloodGroup}</b></dd></div>}
                  {a.contact.facebook && /^https?:\/\//i.test(a.contact.facebook) && <div><dt>Facebook</dt><dd><a href={a.contact.facebook} rel="noreferrer noopener">Facebook</a></dd></div>}
                </dl>
              ) : <p className="muted">{t('alumni.noContactDetailsAre')}</p>}
            </section>
          )}
        </div>
      </div>
    </article>
  )
}

// An alumnus in the list: the same shape as a student card, in the "premium" gold-on-graphite colours. The whole card
// opens the details pop-up; the name is the link.
function AlumniCard({ a, onOpen }) {
  const { t, n } = useApp()
  const photo = usePhoto(a.photo)
  return (
    <article className="student-card alumni-card">
      <span className="sc-mono al-mono" aria-hidden="true">
        {photo ? <img src={photo} alt="" /> : <b>{initials(a.name)}</b>}
        <span className="sc-go"><Icon name="arrow" size={15} /></span>
      </span>
      <span className="student-info">
        <h3><a className="al-open" href={`?profile=${a.id}`} onClick={(e) => { if (e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) { e.preventDefault(); onOpen(a.id) } }}>{a.name}</a>{a.verified && <VerifiedMark size={15} />}</h3>
        <p className="sc-dept">{a.department || '—'}</p>
        <p className="sc-meta">{a.batch ? <span>{t('students.batch')} {n(a.batch)}</span> : null}</p>
      </span>
    </article>
  )
}

export function Alumni() {
  const { t, n, pick } = useApp()
  const [sp, setSp] = useSearchParams()
  const [profile, openProfile, closeProfile] = useProfileParam()
  const f = { q: sp.get('q') || '', batch: sp.get('batch') || '', department: sp.get('department') || '', page: Number(sp.get('page')) || 1 }
  const [text, setText] = useState(f.q)
  const dq = useDebounced(text)
  const set = (patch) => {
    const next = { ...f, ...patch }
    const out = {}
    Object.entries(next).forEach(([k, v]) => { if (v && !(k === 'page' && v === 1)) out[k] = v })
    setSp(out, { replace: true })
  }
  useEffect(() => { if (dq !== f.q) set({ q: dq, page: 1 }) /* eslint-disable-line */ }, [dq])
  const res = useApi(`/alumni${qs({ ...f, limit: 40 })}`)
  const facets = res.data?.facets
  return (
    <>
      <PageHero page="alumni" kicker={t('alumni.kicker')} title={t('alumni.pageTitle')} variant="stack" lede={t('alumni.lede')} src="/images/bswa/river.webp">
        <div className="banner-search" role="search">
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={res.data?.view && res.data.view !== 'public' ? t('alumni.nameProfessionBloodGroup') : t('alumni.search')} aria-label={t('alumni.search')} />
          <span className="search-go" aria-hidden="true"><Icon name="search" size={18} /></span>
        </div>
      </PageHero>
      <section className="section wrap">
        <div className="filters filters-2 toolbar-card">
          <select value={f.batch} onChange={(e) => set({ batch: e.target.value, page: 1 })} aria-label={t('students.batch')}>
            <option value="">{t('students.allBatches')}</option>
            {Object.keys(facets?.batches || {}).sort((a, b) => a - b).map((b) => <option key={b} value={b}>{t('students.batch')} {n(b)} ({n(facets.batches[b])})</option>)}
          </select>
          <select value={f.department} onChange={(e) => set({ department: e.target.value, page: 1 })} aria-label={t('students.dept')}>
            <option value="">{t('students.allDepts')}</option>
            {Object.keys(facets?.departments || {}).filter(Boolean).sort().map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          {(f.q || f.batch || f.department) && <button className="btn btn-ghost btn-sm" onClick={() => { setText(''); setSp({}, { replace: true }) }}>{t('common.clear')}</button>}
        </div>
        <Data q={res} skeleton="people">
          {(d) => (
            <>
              <p className="privacy-note">🔒 {t('alumni.note')} {d.view === 'public'
                ? <>{t('alumni.contactDetailsPhoneEmail')} <Link to="/login" state={{ from: '/alumni' }}>{t('nav.login')} →</Link></>
                : t('alumni.youAreSeeingContact')}</p>
              <p className="muted result-count" aria-live="polite">{n(d.total)} {t('alumni.found')}
                {d.alumniUpToBatch > 0 && <> · {t('alumni.upTo').replace('{n}', n(d.alumniUpToBatch))} <Link className="link-arrow" to="/students">{t('alumni.laterStudents').replace('{n}', n(d.alumniUpToBatch + 1))} →</Link></>}</p>
              {d.items.length === 0 ? <Empty icon="search" title={t('alumni.noneTitle')}>{t('alumni.noneHint')}</Empty> : (
                <BatchGroups items={d.items} sessions={d.facets?.batchSessions} counts={!f.q && !f.department ? d.facets?.batches : null} gridClass="student-grid">
                  {(a) => <AlumniCard key={a.id} a={a} onOpen={openProfile} />}
                </BatchGroups>
              )}
              <Pagination page={d.page} pages={d.pages} onPage={(p) => set({ page: p })} />
              {profile && (() => { const a = d.items.find((x) => String(x.id) === profile); return a ? <ProfileDialog label={a.name} onClose={closeProfile}><AlumniProfile a={a} view={d.view} /></ProfileDialog> : null })()}
            </>
          )}
        </Data>
      </section>
    </>
  )
}

/* ---------------- Committee ---------------- */
export function Committee() {
  const { t, n, pick } = useApp()
  const raw = useApi('/executive-committee')
  // the committee and its seats in the visitor's language (the main text when the other one is empty);
  // grouping still reads both designations
  const res = raw.data ? { ...raw, data: {
    committee: raw.data.committee && { ...raw.data.committee, name: pick(raw.data.committee.name, raw.data.committee.nameEn), term: pick(raw.data.committee.term, raw.data.committee.termEn), description: pick(raw.data.committee.description, raw.data.committee.descriptionEn) },
    members: raw.data.members.map((m) => ({ ...m, seat: `${m.designation} ${m.designationEn || ''}`, designation: pick(m.designation, m.designationEn), bio: pick(m.bio, m.bioEn), message: pick(m.message, m.messageEn) })),
  } } : raw
  const [profile, openProfile, closeProfile] = useProfileParam()
  // a click on a member opens their details in the pop-up (a click with Ctrl/⌘ still opens the link as usual)
  const go = (id) => (e) => { if (e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) { e.preventDefault(); openProfile(id) } }
  const name = (m) => <a className="cm-open" href={`?profile=${m.id}`} onClick={go(m.id)}>{m.name}</a>
  return (
    <>
      <PageHero page="committee" kicker={t('committee.kicker')} title={t('committee.title')} variant="frame" lede={t('committee.lede')} src="/images/bswa/mosque.webp" />
      <section className="section wrap">
        <Data q={res} skeleton="committee">
          {(d) => !d.committee || d.members.length === 0 ? <Empty icon="users" title={t('committee.emptyTitle')} action={<Link className="btn btn-outline" to="/help#contact">{t('footer.send')} <Icon name="arrow" size={16} className="arr" /></Link>}>{t('committee.empty')}</Empty> : (
            <>
              <header className="committee-head">
                <h2>{d.committee.name}</h2>
                <p className="muted">{[d.committee.term, d.committee.startsOn && `${d.committee.startsOn} → ${d.committee.endsOn || '…'}`].filter(Boolean).join(' · ')}</p>
                {d.committee.description && <p className="committee-intro">{d.committee.description}</p>}
              </header>
              {groupSeats(d.members).map(([key, seats]) => {
                if (seats.length === 0) return null
                // the first two executive seats (president, general secretary) lead in larger cards when the list is long
                const lead = key === 'exec' && seats.length > 3 ? seats.slice(0, 2) : []
                const rest = seats.slice(lead.length)
                return (
                  <section key={key} className={`cm-group cm-${key}`} aria-labelledby={`cg-${key}`}>
                    <h3 id={`cg-${key}`} className="cm-group-h">{t(`committee.group.${key}`)}<span>{seats.length}</span></h3>
                    {lead.length > 0 && (
                      <div className="cm-lead">
                        {lead.map((m) => (
                          <article key={m.id} className="cm-lead-card">
                            <span className="cm-ring"><ExecPhoto m={m} size={112} /></span>
                            <div>
                              <p className="cm-role">{m.designation}</p>
                              <h3>{name(m)}{m.verified && <VerifiedMark size={17} />}</h3>
                              {m.bio && <p className="exec-bio">{m.bio}</p>}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                    {key === 'exec' ? (
                      <div className="cm-grid">
                        {rest.map((m) => (
                          <article key={m.id} className="member-card">
                            <span className="cm-ring"><ExecPhoto m={m} size={88} /></span>
                            <h3>{name(m)}{m.verified && <VerifiedMark size={15} />}</h3>
                            <p className="cm-chip">{m.designation}</p>
                            {(m.department || m.batch) && <p className="cm-who">{[m.department, m.batch && `${t('students.batch')} ${/^\d+$/.test(m.batch) ? n(m.batch) : m.batch}`].filter(Boolean).join(' · ')}</p>}
                            {m.bio && <p className="muted small exec-bio">{m.bio}</p>}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="cm-advisors">
                        {rest.map((m) => (
                          <article key={m.id} className="advisor-row">
                            <ExecPhoto m={m} size={52} />
                            <div>
                              <h3>{name(m)}{m.verified && <VerifiedMark size={14} />}</h3>
                              <p className="role">{m.designation}</p>
                              {m.bio && <p className="muted small exec-bio">{m.bio}</p>}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
              {profile && (() => {
                const m = d.members.find((x) => String(x.id) === profile)
                const group = groupSeats(d.members).find(([, seats]) => seats.includes(m))?.[0]
                return m ? <ProfileDialog label={m.name} onClose={closeProfile}><CommitteeProfile m={m} group={group} committee={d.committee} /></ProfileDialog> : null
              })()}
            </>
          )}
        </Data>
      </section>
    </>
  )
}

// Honorifics are skipped (several may stand together, as in অধ্যাপক ড. ...) so the monogram is the first letter of the
// name itself, without its vowel sign: মোঃ রহিম → র, সুমন → স, Dr. Karim → K.
const HONORIFIC = /^(?:(?:মোঃ|মো:|মোহাঃ|মো\.|মোছাঃ|মোসাঃ|ডঃ|ড\.|ডা\.|md\.|mst\.|dr\.|prof\.|mr\.|mrs\.|ms\.)\s*|(?:প্রফেসর|অধ্যাপক|md|mst|dr|prof|mr|mrs|ms)\s+)/iu
function firstLetter(name) {
  let n = (name || '').trim()
  for (let prev = ''; prev !== n;) { prev = n; n = n.replace(HONORIFIC, '').trim() }
  return ((n || name || '?').match(/\p{L}/u)?.[0] || '?').toUpperCase()
}

// A member's photo when one was given; otherwise one letter in a soft tint chosen from the name.
function ExecPhoto({ m, size = 96 }) {
  const [bad, setBad] = useState(false)
  if (m.photoUrl && !bad) return <img className="exec-photo" src={m.photoUrl} alt={m.name} width={size} height={size} style={{ width: size, height: size }} loading="lazy" decoding="async" onError={() => setBad(true)} />
  let h = 0
  for (const c of m.name || '?') h = (h * 31 + c.charCodeAt(0)) % 997
  return <span className={`cm-mono tint-${['peach', 'teal', 'orange', 'sand'][h % 4]}`} style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{firstLetter(m.name)}</span>
}

// One member's details in the pop-up: the photo (a click enlarges it), name, post, group, the committee and its term,
// and the whole introduction (the cards show only its first lines).
function SeatPhoto({ m }) {
  const { t, pick } = useApp()
  const [open, setOpen] = useState(false)
  const [bad, setBad] = useState(false)
  if (!m.photoUrl || bad) return <span className="sp-avatar" aria-hidden="true">{firstLetter(m.name)}</span>
  return (
    <>
      <button type="button" className="sp-avatar sp-zoomable" onClick={() => setOpen(true)} aria-label={`${t('committee.viewThePhotoLarger')}: ${m.name}`}>
        <img src={m.photoUrl} alt="" onError={() => setBad(true)} /><span className="sp-zoom-ic" aria-hidden="true">⤢</span>
      </button>
      {open && <PhotoViewer src={m.photoUrl} alt={m.name} onClose={() => setOpen(false)} />}
    </>
  )
}

function CommitteeProfile({ m, group, committee }) {
  const { t, n, pick } = useApp()
  const term = [committee.term, committee.startsOn && `${committee.startsOn} → ${committee.endsOn || '…'}`].filter(Boolean).join(' · ')
  // who they are, as in a student's pop-up (an admin's entry, or the linked member's profile)
  const identity = [
    [t('students.dept'), m.department], [t('students.batch'), m.batch && (/^\d+$/.test(m.batch) ? n(m.batch) : m.batch)],
    [t('students.session'), m.session], [t('students.from'), pick(m.upazila, m.upazilaEn)],
  ].filter(([, v]) => v)
  return (
    <article className="sprofile is-modal">
      <div className="pm-cover" aria-hidden="true" />
      <div className="sp-head">
        <SeatPhoto m={m} />
        <div className="sp-id">
          <h1>{m.name}{m.verified && <VerifiedMark size={18} />}</h1>
          <ul className="sp-chips">
            {m.designation && <li>{m.designation}</li>}
            {group && <li>{t(`committee.group.${group}`)}</li>}
          </ul>
        </div>
      </div>
      <div className="sp-body">
        <div className="sp-main">
          {m.message && (
            <section className="sp-sec cm-message">
              <h2>{t('committee.messageH')}</h2>
              <blockquote><p>{m.message}</p><footer>— {m.name}{m.designation ? `, ${m.designation}` : ''}</footer></blockquote>
            </section>
          )}
          {identity.length > 0 && (
            <section className="sp-sec">
              <h2>{t('committee.identityH')}</h2>
              <dl className="sp-facts">{identity.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            </section>
          )}
          <section className="sp-sec">
            <h2>{t('committee.about')}</h2>
            {m.bio ? <p className="cm-bio-full">{m.bio}</p> : <p className="muted">{t('committee.noIntroductionHasBeen')}</p>}
          </section>
          <section className="sp-sec">
            <dl className="sp-facts">
              <div><dt>{t('committee.committee')}</dt><dd>{committee.name}</dd></div>
              {term && <div><dt>{t('committee.term2')}</dt><dd>{term}</dd></div>}
              {m.verified && <div><dt>{t('committee.membership')}</dt><dd>{t('verified.mark')}</dd></div>}
            </dl>
          </section>
        </div>
      </div>
    </article>
  )
}

// Seats are shown in three groups by their designation; the order inside each group is the admin's order.
function groupSeats(members) {
  const teacher = (d) => /শিক্ষক উপদেষ্টা|teacher advis/i.test(d)
  const student = (d) => /ছাত্র উপদেষ্টা|student advis|alumni advis/i.test(d)
  const seat = (m) => m.seat || m.designation
  return [
    ['exec', members.filter((m) => !teacher(seat(m)) && !student(seat(m)))],
    ['teachers', members.filter((m) => teacher(seat(m)))],
    ['students', members.filter((m) => student(seat(m)))],
  ]
}

/* ---------------- FAQ ---------------- */
// The questions and answers; one section of the Help & Contact page (its "send a message" button jumps to the form below).
export function FAQSection() {
  const { t, pick } = useApp()
  const res = useApi('/faq')
  return (
    <>
      <div className="wrap help-head" id="faq">
        <p className="eyebrow">{t('faq.kicker')}</p>
        <h2>{t('faq.title')}</h2>
        <p className="muted">{t('faq.lede')}</p>
      </div>
      <section className="section wrap faq-layout" aria-label={t('faq.title')}>
        <Data q={res} skeleton="list">
          {(d) => (
            <div className="faq-list">
              {d.items.map((f, i) => (
                <details key={f.qEn} className="faq-item" open={i === 0}>
                  <summary><span className="faq-n num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><span className="faq-q">{pick(f.qBn, f.qEn)}</span></summary>
                  <p>{pick(f.aBn, f.aEn)}</p>
                </details>
              ))}
            </div>
          )}
        </Data>
        <aside className="faq-help">
          <span className="state-ico" aria-hidden="true"><Icon name="mail" size={22} /></span>
          <h2>{t('faq.helpTitle')}</h2>
          <p>{t('faq.helpText')}</p>
          <a className="btn btn-dark" href="#contact">{t('footer.send')} <Icon name="arrow" size={16} className="arr" /></a>
          <Link className="faq-help-link" to="/membership">{t('faq.helpMember')} →</Link>
        </aside>
      </section>
    </>
  )
}

/* ---------------- Membership ---------------- */
export function Membership() {
  const { t, n } = useApp()
  return (
    <>
      <PageHero page="member" kicker={t('member.kicker')} title={t('member.title')} lede={t('member.lede')} src="/images/bswa/mosque.webp" />
      <section className="section wrap two-col">
        <div>
          <h2>{t('member.who')}</h2>
          <p className="lede">{t('member.whoBody')}</p>
          <ol className="steps">
            {['s1', 's2', 's3'].map((k, i) => <li key={k}><b>{n(i + 1)}</b><span>{t(`member.${k}`)}</span></li>)}
          </ol>
          <div className="row">
            <Link className="btn btn-dark" to="/register">{t('member.cta')} →</Link>
            <Link className="btn btn-ghost" to="/login">{t('member.haveAcc')}</Link>
          </div>
        </div>
        <div className="sketch-card"><img src="/art/students.webp" alt="" loading="lazy" /><img src="/art/sprig.webp" alt="" loading="lazy" style={{ width: 160 }} /></div>
      </section>
    </>
  )
}
