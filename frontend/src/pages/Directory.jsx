import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import UpazilaMap from '../components/UpazilaMap.jsx'
import { Badge, Crumbs, Data, Empty, PageHero } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { PlaceCard } from '../components/cards.jsx'

const fmt = (v, n) => (v == null ? null : n(v.toLocaleString('en-US')))

export default function Directory() {
  const { t, n, pick } = useApp()
  const nav = useNavigate()
  const [sel, setSel] = useState(null)
  const [term, setTerm] = useState('')
  const ups = useApi('/upazilas')
  const places = useApi('/heritage')
  const list = ups.data?.items || []
  const u = list.find((x) => x.slug === sel)

  const unionHits = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (!q) return []
    return list.flatMap((x) => x.unions.filter((un) => un.toLowerCase().includes(q)).map((un) => ({ un, x })))
  }, [term, list])
  const shown = list.filter((x) => !term || pickMatch(x, term))
  function pickMatch(x, q) { return `${x.nameEn} ${x.nameBn}`.toLowerCase().includes(q.toLowerCase()) }

  return (
    <>
      <PageHero kicker={t('dir.kicker')} title={t('dir.title')} lede={t('dir.lede')} src="/images/bswa/river.webp">
        <div className="banner-search" role="search">
          <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('dir.search')} aria-label={t('dir.search')} />
          <span className="search-go" aria-hidden="true"><Icon name="search" size={18} /></span>
        </div>
      </PageHero>
      <section className="section wrap">
        <Crumbs items={[{ to: '/', label: t('nav.home') }, { label: t('nav.directory') }]} />
        <p className="hier">{t('dir.country')} <i>›</i> {pick('চট্টগ্রাম বিভাগ', 'Chattogram Division')} <i>›</i> {pick('ব্রাহ্মণবাড়িয়া জেলা', 'Brahmanbaria District')}</p>
        <div className="dir-layout">
          <Data q={ups} skeleton="block">
            {() => (
              <>
                <UpazilaMap upazilas={list} places={places.data?.items || []} selected={sel} onSelect={setSel} onPin={(p) => nav(`/heritage/${p.slug}`)} />
                <aside className="dir-side">
                  {term && unionHits.length > 0 && (
                    <ul className="union-hits">
                      {unionHits.slice(0, 8).map(({ un, x }) => (
                        <li key={`${x.slug}-${un}`}><Link to={`/directory/${x.slug}`}>{un}</Link> <span className="muted">· {pick(x.nameBn, x.nameEn)}</span></li>
                      ))}
                    </ul>
                  )}
                  {u ? <UpazilaSummary u={u} /> : <p className="muted pick-hint">{t('dir.pick')}</p>}
                  <ul className="up-list">
                    {shown.length === 0 && <li className="muted">{t('state.empty')}</li>}
                    {shown.map((x) => (
                      <li key={x.slug}>
                        <button className={sel === x.slug ? 'on' : ''} onClick={() => setSel(x.slug)}>
                          <span>{pick(x.nameBn, x.nameEn)}</span><span className="muted num">{n(x.unions.length)} {t('dir.unions')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </aside>
              </>
            )}
          </Data>
        </div>
      </section>
    </>
  )
}

function UpazilaSummary({ u }) {
  const { t, n, pick } = useApp()
  return (
    <div className="map-panel">
      <h3>{pick(u.nameBn, u.nameEn)}</h3>
      <dl className="mini-stats">
        <div><dt>{t('dir.members')}</dt><dd className="num">{n(u.members)}</dd></div>
        <div><dt>{t('dir.unions')}</dt><dd className="num">{n(u.unions.length)}</dd></div>
        <div><dt>{t('dir.places')}</dt><dd className="num">{n(u.places)}</dd></div>
      </dl>
      <div className="row">
        <Link className="btn btn-dark btn-sm" to={`/directory/${u.slug}`}>{t('dir.view')} →</Link>
        <Link className="btn btn-ghost btn-sm" to={`/students?upazila=${u.slug}`}>{t('dir.studentsFrom')}</Link>
      </div>
    </div>
  )
}

export function UpazilaDetail() {
  const { slug } = useParams()
  const { t, n, pick } = useApp()
  const res = useApi(`/upazilas/${slug}`)
  const [q, setQ] = useState('')
  return (
    <section className="section wrap">
      <Data q={res} skeleton="cards">
        {({ upazila: u, places }) => {
          const unions = u.unions.filter((x) => x.toLowerCase().includes(q.toLowerCase()))
          return (
            <>
              <Crumbs items={[{ to: '/', label: t('nav.home') }, { to: '/directory', label: t('nav.directory') }, { label: pick(u.nameBn, u.nameEn) }]} />
              <header className="detail-head">
                <p className="kicker">{pick('ব্রাহ্মণবাড়িয়া জেলা', 'Brahmanbaria District')}</p>
                <h1>{pick(u.nameBn, u.nameEn)}</h1>
                {!u.verified && <Badge tone="muted">{t('dir.notVerified')}</Badge>}
              </header>
              <dl className="facts facts-row">
                <div><dt>{t('dir.members')}</dt><dd className="num">{n(u.members)}</dd></div>
                <div><dt>{t('dir.unions')}</dt><dd className="num">{n(u.unions.length)}</dd></div>
                <div><dt>{t('dir.population')}</dt><dd className="num">{fmt(u.population, n) || t('dir.notAvailable')}</dd></div>
                <div><dt>{t('dir.area')}</dt><dd className="num">{u.areaKm2 ? `${n(u.areaKm2)} ${t('dir.sqkm')}` : t('dir.notAvailable')}</dd></div>
              </dl>
              {/* places across the full width, then the unions beside the students link */}
              <section className="up-places" aria-labelledby="up-places-h">
                <div className="section-head">
                  <h2 id="up-places-h">{t('dir.places')} <span className="up-count num">{n(places.length)}</span></h2>
                  <Link className="link-arrow" to={`/heritage?upazila=${u.slug}`}>{t('common.viewAll')} <Icon name="arrow" size={15} className="arr" /></Link>
                </div>
                {places.length === 0 ? <Empty /> : <div className="up-place-grid">{places.map((p) => <PlaceCard key={p.slug} p={p} upazilas={[u]} />)}</div>}
              </section>
              <div className="up-bottom">
                <section className="up-unions" aria-labelledby="up-unions-h">
                  <div className="up-unions-head">
                    <h2 id="up-unions-h">{t('dir.unions')} <span className="up-count num">{n(u.unions.length)}</span></h2>
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('dir.search')} aria-label={t('dir.search')} />
                  </div>
                  {unions.length === 0 ? <Empty>{t('dir.noUnion')}</Empty> : (
                    <ol className="up-union-chips">{unions.map((x) => <li key={x}><Icon name="pin" size={14} />{x}</li>)}</ol>
                  )}
                  <p className="muted small">{u.unionSource} {u.note} {t('dir.source')}: <a href={u.source} target="_blank" rel="noreferrer">Wikipedia</a> · {u.lastVerified}.</p>
                </section>
                <aside className="up-students">
                  <span className="up-students-ico" aria-hidden="true"><Icon name="users" size={26} /></span>
                  <p className="up-students-n num">{n(u.members)}</p>
                  <p>{pick(`${u.nameBn} থেকে আসা শিক্ষার্থী`, `Students from ${u.nameEn}`)}</p>
                  <Link className="btn btn-dark" to={`/students?upazila=${u.slug}`}>{t('dir.studentsFrom')} <Icon name="arrow" size={16} className="arr" /></Link>
                </aside>
              </div>
            </>
          )
        }}
      </Data>
    </section>
  )
}
