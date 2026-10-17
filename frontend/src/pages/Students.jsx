import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useApi, qs } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Avatar, Badge, Crumbs, Data, Empty, Pagination, PageHero } from '../components/ui.jsx'
import { StudentCard } from '../components/cards.jsx'
import { Students as StudentsSketch } from '../components/Sketch.jsx'

function useDebounced(v, ms = 250) {
  const [d, setD] = useState(v)
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id) }, [v, ms])
  return d
}

export default function Students() {
  const { t, n, pick } = useApp()
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

  return (
    <>
      <PageHero kicker={t('students.kicker')} title={t('students.title')} lede={t('students.lede')} image="nabinagar" shape="b" />
      <section className="section wrap">
        <div className="filters">
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('students.search')} aria-label={t('students.search')} />
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
          {(f.q || f.batch || f.department || f.upazila) && <button className="btn btn-ghost btn-sm" onClick={() => { setText(''); setSp({}, { replace: true }) }}>{t('common.clear')}</button>}
        </div>
        <p className="privacy-note">🔒 {t('students.privacy')} {res.data?.sample && <Badge tone="gold">{t('students.sample')}</Badge>}</p>
        <Data q={res}>
          {(d) => (
            <>
              <p className="muted result-count" aria-live="polite">{n(d.total)} {t('students.found')}</p>
              {d.items.length === 0 ? <Empty /> : <div className="cards-4">{d.items.map((s) => <StudentCard key={s.id} s={s} upazilas={upazilas} />)}</div>}
              <Pagination page={d.page} pages={d.pages} onPage={(p) => set({ page: p })} />
            </>
          )}
        </Data>
      </section>
    </>
  )
}

export function StudentDetail() {
  const { id } = useParams()
  const { t, n, pick } = useApp()
  const res = useApi(`/students/${id}`)
  const ups = useApi('/upazilas')
  return (
    <section className="section wrap narrow">
      <Data q={res}>
        {(s) => {
          const up = (ups.data?.items || []).find((u) => u.slug === s.upazila)
          return (
            <>
              <Crumbs items={[{ to: '/', label: t('nav.home') }, { to: '/students', label: t('nav.students') }, { label: s.name }]} />
              <article className="profile">
                <Avatar name={s.name} size={110} />
                <div>
                  <Badge tone="leaf">{t('students.profile')}</Badge>
                  <h1>{s.name}</h1>
                  <dl className="facts">
                    <div><dt>{t('students.dept')}</dt><dd>{s.department || '—'}</dd></div>
                    <div><dt>{t('students.batch')}</dt><dd>{s.batch ? n(s.batch) : '—'}</dd></div>
                    <div><dt>{t('students.session')}</dt><dd>{s.session || '—'}</dd></div>
                    <div><dt>{t('students.from')}</dt><dd>{up ? <Link to={`/directory/${up.slug}`}>{pick(up.nameBn, up.nameEn)}</Link> : '—'}</dd></div>
                  </dl>
                  <p className="privacy-note">🔒 {t('students.hidden')}</p>
                  <Link className="link-arrow" to="/students">← {t('students.back')}</Link>
                </div>
                <StudentsSketch className="sketch profile-sketch" />
              </article>
            </>
          )
        }}
      </Data>
    </section>
  )
}
