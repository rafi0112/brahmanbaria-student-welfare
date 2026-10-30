import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useApi, qs } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Avatar, Data, Empty, PageHero, Pagination, VerifiedMark } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

/* ---------------- Alumni ---------------- */
function useDebounced(v, ms = 250) {
  const [d, setD] = useState(v)
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id) }, [v, ms])
  return d
}

export function Alumni() {
  const { t, n } = useApp()
  const [sp, setSp] = useSearchParams()
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
  const res = useApi(`/alumni${qs({ ...f, limit: 12 })}`)
  const facets = res.data?.facets
  return (
    <>
      <PageHero kicker={t('alumni.kicker')} title={t('alumni.pageTitle')} variant="circle" lede={t('alumni.lede')} src="/images/bswa/river.webp">
        <div className="banner-search" role="search">
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('alumni.search')} aria-label={t('alumni.search')} />
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
        <p className="privacy-note">🔒 {t('alumni.note')}</p>
        <Data q={res} skeleton="people">
          {(d) => (
            <>
              <p className="muted result-count" aria-live="polite">{n(d.total)} {t('alumni.found')}
                {d.alumniUpToBatch > 0 && <> · {t('alumni.upTo').replace('{n}', n(d.alumniUpToBatch))} <Link className="link-arrow" to="/students">{t('alumni.laterStudents').replace('{n}', n(d.alumniUpToBatch + 1))} →</Link></>}</p>
              {d.items.length === 0 ? <Empty icon="search" title={t('alumni.noneTitle')}>{t('alumni.noneHint')}</Empty> : (
                <div className="cards-3">
                  {d.items.map((a) => (
                    <article key={a.id} className="alumni-card">
                      <header className="al-head">
                        <Avatar name={a.name} size={52} />
                        <div>
                          <h3>{a.name}</h3>
                          {(a.designation || a.occupation) && <p className="al-role">{[...new Set([a.designation, a.occupation].filter(Boolean))].join(' · ')}</p>}
                        </div>
                      </header>
                      {a.workplace && <p className="al-work"><Icon name="landmark" size={15} /> <span>{a.workplace}</span></p>}
                      <p className="al-chips">
                        {a.department && <span className="chip-mini">{a.department}</span>}
                        {a.batch ? <span className="chip-mini is-batch">{t('students.batch')} {n(a.batch)}</span> : null}
                      </p>
                    </article>
                  ))}
                </div>
              )}
              <Pagination page={d.page} pages={d.pages} onPage={(p) => set({ page: p })} />
            </>
          )}
        </Data>
      </section>
    </>
  )
}

/* ---------------- Committee ---------------- */
export function Committee() {
  const { t } = useApp()
  const res = useApi('/executive-committee')
  return (
    <>
      <PageHero kicker={t('committee.kicker')} title={t('committee.title')} variant="frame" lede={t('committee.lede')} src="/images/bswa/mosque.webp" />
      <section className="section wrap">
        <Data q={res} skeleton="committee">
          {(d) => !d.committee || d.members.length === 0 ? <Empty icon="users" title={t('committee.emptyTitle')} action={<Link className="btn btn-outline" to="/help#contact">{t('footer.send')} <Icon name="arrow" size={16} className="arr" /></Link>}>{t('committee.empty')}</Empty> : (
            <>
              <header className="committee-head">
                <h2>{d.committee.name}</h2>
                <p className="muted">{[d.committee.term, d.committee.startsOn && `${d.committee.startsOn} → ${d.committee.endsOn || '…'}`].filter(Boolean).join(' · ')}</p>
                {d.committee.description && <p className="committee-intro">{d.committee.description}</p>}
              </header>
              {groupSeats(d.members).map(([key, seats]) => seats.length > 0 && (
                <section key={key} className="cm-group" aria-labelledby={`cg-${key}`}>
                  <h3 id={`cg-${key}`} className="cm-group-h">{t(`committee.group.${key}`)}<span>{seats.length}</span></h3>
                  <div className={key === 'exec' ? 'cards-4' : 'cm-advisors'}>
                    {seats.map((m) => (
                      <article key={m.id} className={key === 'exec' ? 'member-card' : 'advisor-row'}>
                        <ExecPhoto m={m} size={key === 'exec' ? 96 : 52} />
                        <div>
                          <h3>{m.name}{m.verified && <VerifiedMark size={key === 'exec' ? 16 : 14} />}</h3>
                          <p className="role">{m.designation}</p>
                          {m.bio && <p className="muted small exec-bio">{m.bio}</p>}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </Data>
      </section>
    </>
  )
}

function ExecPhoto({ m, size = 96 }) {
  const [bad, setBad] = useState(false)
  if (m.photoUrl && !bad) return <img className="exec-photo" src={m.photoUrl} alt={m.name} width={size} height={size} style={{ width: size, height: size }} loading="lazy" decoding="async" onError={() => setBad(true)} />
  return <Avatar name={m.name} size={size} />
}

// Seats are shown in three groups by their designation; the order inside each group is the admin's order.
function groupSeats(members) {
  const teacher = (d) => /শিক্ষক উপদেষ্টা|teacher advis/i.test(d)
  const student = (d) => /ছাত্র উপদেষ্টা|student advis|alumni advis/i.test(d)
  return [
    ['exec', members.filter((m) => !teacher(m.designation) && !student(m.designation))],
    ['teachers', members.filter((m) => teacher(m.designation))],
    ['students', members.filter((m) => student(m.designation))],
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
      <PageHero kicker={t('member.kicker')} title={t('member.title')} lede={t('member.lede')} src="/images/bswa/mosque.webp" />
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
