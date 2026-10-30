import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Crumbs, Data, Empty, PageHero, Pagination } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import Reveal from '../components/Reveal.jsx'
import { eventDate, eventImage } from '../components/EventCarousel.jsx'

const PER_PAGE = 9
const today = () => new Date().toISOString().slice(0, 10)

function EventPicture({ e, sizes, eager }) {
  const img = eventImage(e)
  return img ? <img src={img.src} srcSet={img.srcSet} sizes={sizes} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" /> : <div className="evp-noimg" aria-hidden="true" />
}

// One event in the list: picture with the date, status, title, when and where, and a short description.
function EventTile({ e }) {
  const { pick, n, lang } = useApp()
  const d = eventDate(e.date, lang, n)
  const up = e.date >= today()
  return (
    <Link to={`/events/${e.slug}`} className="evp-card">
      <div className="evp-card-img">
        <EventPicture e={e} sizes="(min-width: 1000px) 30vw, (min-width: 640px) 45vw, 92vw" />
        {d && <time className="evp-date" dateTime={e.date}><b>{d.day}</b><span>{d.month}</span></time>}
        <span className={`evp-badge ${up ? 'up' : 'past'}`}>{up ? pick('আসন্ন', 'Upcoming') : pick('সম্পন্ন', 'Past')}</span>
      </div>
      <div className="evp-card-body">
        <h3>{pick(e.titleBn, e.titleEn)}</h3>
        <p className="evp-meta">
          <span><Icon name="clock" size={14} /> {d?.long || e.date}{e.time ? ` · ${e.time}` : ''}</span>
          {e.venue && <span><Icon name="pin" size={14} /> {e.venue}</span>}
        </p>
        {(e.summaryBn || e.summaryEn || e.summary) && <p className="evp-sum">{pick(e.summaryBn, e.summaryEn) || e.summary}</p>}
        <span className="evp-more">{pick('বিস্তারিত', 'Details')} <Icon name="arrow" size={15} className="arr" /></span>
      </div>
    </Link>
  )
}

// Events: a featured event on top, then search, upcoming / past / all, sorting and pages. Everything comes from the
// published events in the database; the filters live in the address so a view can be shared.
export function Events() {
  const { t, pick, n, lang } = useApp()
  const res = useApi('/events')
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') || ''
  const when = sp.get('when') || 'all'
  const sort = sp.get('sort') || 'soon'
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const set = (patch) => {
    const next = { q, when, sort, page: '1', ...patch }
    const out = {}
    if (next.q) out.q = next.q
    if (next.when !== 'all') out.when = next.when
    if (next.sort !== 'soon') out.sort = next.sort
    if (next.page !== '1') out.page = next.page
    setSp(out, { replace: true })
  }
  const items = res.data?.items || []
  const featured = useMemo(() => {
    const up = items.filter((e) => e.date >= today()).sort((a, b) => a.date.localeCompare(b.date))
    return items.find((e) => e.featured && e.date >= today()) || items.find((e) => e.featured) || up[0] || null
  }, [items])
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const t0 = today()
    let out = items.filter((e) => (when === 'upcoming' ? e.date >= t0 : when === 'past' ? e.date < t0 : true))
    if (needle) out = out.filter((e) => [e.titleBn, e.titleEn, e.venue, e.summaryBn, e.summaryEn].filter(Boolean).join(' ').toLowerCase().includes(needle))
    // "soonest": upcoming first (nearest first), then past (most recent first); "latest": newest date first
    if (sort === 'latest') out = [...out].sort((a, b) => b.date.localeCompare(a.date))
    else if (sort === 'oldest') out = [...out].sort((a, b) => a.date.localeCompare(b.date))
    else out = [...out.filter((e) => e.date >= t0).sort((a, b) => a.date.localeCompare(b.date)), ...out.filter((e) => e.date < t0).sort((a, b) => b.date.localeCompare(a.date))]
    return out
  }, [items, q, when, sort])
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE))
  const shown = list.slice((Math.min(page, pages) - 1) * PER_PAGE, Math.min(page, pages) * PER_PAGE)
  const counts = { all: items.length, upcoming: items.filter((e) => e.date >= today()).length, past: items.filter((e) => e.date < today()).length }

  return (
    <>
      <PageHero kicker={t('events.kicker')} title={t('events.title')} variant="arch" lede={t('events.lede')} src="/images/bswa/puppets.webp" />
      <section className="section wrap evp">
        <Data q={res} skeleton="cards">
          {() => (items.length === 0 ? (
            <Empty icon="calendar" title={t('events.emptyTitle')} action={<><Link className="btn btn-dark" to="/help#contact">{t('events.suggest')} <Icon name="arrow" size={16} className="arr" /></Link><Link className="btn btn-outline" to="/gallery">{t('events.seeGallery')}</Link></>}>{t('events.empty')}</Empty>
          ) : (
            <>
              {featured && (
                <Reveal className="evp-feature">
                  <Link to={`/events/${featured.slug}`} className="evp-feature-link">
                    <div className="evp-feature-img"><EventPicture e={featured} sizes="(min-width: 1000px) 60vw, 100vw" eager /></div>
                    <div className="evp-feature-copy">
                      <p className="eyebrow">{featured.featured ? pick('ফিচার্ড ইভেন্ট', 'Featured event') : pick('পরবর্তী ইভেন্ট', 'Next event')}</p>
                      <h2>{pick(featured.titleBn, featured.titleEn)}</h2>
                      <p className="evp-meta">
                        <span><Icon name="calendar" size={16} /> {eventDate(featured.date, lang, n)?.long || featured.date}{featured.time ? ` · ${featured.time}` : ''}</span>
                        {featured.venue && <span><Icon name="pin" size={16} /> {featured.venue}</span>}
                      </p>
                      {(featured.summaryBn || featured.summaryEn) && <p className="evp-sum">{pick(featured.summaryBn, featured.summaryEn)}</p>}
                      <span className="btn btn-dark">{pick('বিস্তারিত দেখুন', 'View details')} <Icon name="arrow" size={16} className="arr" /></span>
                    </div>
                  </Link>
                </Reveal>
              )}

              <div className="evp-toolbar" role="search">
                <label className="evp-search">
                  <Icon name="search" size={18} />
                  <input type="search" value={q} onChange={(e) => set({ q: e.target.value })} placeholder={pick('ইভেন্ট, স্থান বা বিষয় খুঁজুন…', 'Search events, venues or topics…')} aria-label={pick('ইভেন্ট খুঁজুন', 'Search events')} />
                </label>
                <div className="evp-tabs" role="group" aria-label={pick('সময় অনুযায়ী', 'By time')}>
                  {[['all', 'সব', 'All'], ['upcoming', 'আসন্ন', 'Upcoming'], ['past', 'সম্পন্ন', 'Past']].map(([k, bn, en]) => (
                    <button key={k} type="button" className={`chip ${when === k ? 'on' : ''}`} aria-pressed={when === k} onClick={() => set({ when: k })}>{pick(bn, en)} <span className="num">{n(counts[k])}</span></button>
                  ))}
                </div>
                <label className="evp-sort">
                  <span className="sr-only">{pick('সাজান', 'Sort')}</span>
                  <select value={sort} onChange={(e) => set({ sort: e.target.value })}>
                    <option value="soon">{pick('আসন্ন আগে', 'Upcoming first')}</option>
                    <option value="latest">{pick('নতুন তারিখ আগে', 'Newest date first')}</option>
                    <option value="oldest">{pick('পুরনো তারিখ আগে', 'Oldest date first')}</option>
                  </select>
                </label>
              </div>
              <p className="muted result-count" aria-live="polite">{n(list.length)} {pick('টি ইভেন্ট', list.length === 1 ? 'event' : 'events')}</p>

              {shown.length === 0 ? (
                <Empty icon="search" title={pick('কিছু পাওয়া যায়নি', 'Nothing found')}>
                  {pick('অন্য শব্দে খুঁজুন বা ফিল্টার বদলান।', 'Try other words or change the filter.')}
                </Empty>
              ) : (
                <div className="evp-grid">{shown.map((e, i) => <Reveal key={e.slug} delay={(i % 3) * 60}><EventTile e={e} /></Reveal>)}</div>
              )}
              <Pagination page={Math.min(page, pages)} pages={pages} onPage={(p) => { set({ page: String(p) }); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
            </>
          ))}
        </Data>
      </section>
    </>
  )
}

// One event: its picture, date and place, the description in the visitor's language, the photo gallery and a link.
export function EventDetail() {
  const { slug } = useParams()
  const { t, pick, n, lang } = useApp()
  const res = useApi(`/events/${slug}`)
  const [open, setOpen] = useState(null) // index of the photo shown large
  return (
    <section className="section wrap evd">
      <Data q={res} skeleton="block">
        {(e) => {
          const d = eventDate(e.date, lang, n)
          const end = e.endDate ? eventDate(e.endDate, lang, n) : null
          const up = e.date >= today()
          const photos = (e.gallery || []).map((ref, i) => (e.galleryUrls?.[i] ? { src: e.galleryUrls[i] } : eventImage({ image: ref }))).filter(Boolean)
          const desc = pick(e.summaryBn, e.summaryEn) || e.summary || ''
          return (
            <>
              <Crumbs items={[{ to: '/', label: t('nav.home') }, { to: '/events', label: t('nav.events') }, { label: pick(e.titleBn, e.titleEn) }]} />
              <div className="evd-hero">
                <div className="evd-img"><EventPicture e={e} sizes="(min-width: 1000px) 60vw, 100vw" eager /></div>
                <div className="evd-info">
                  <span className={`evp-badge ${up ? 'up' : 'past'}`}>{up ? pick('আসন্ন', 'Upcoming') : pick('সম্পন্ন', 'Past')}</span>
                  <h1>{pick(e.titleBn, e.titleEn)}</h1>
                  <dl className="evd-facts">
                    <div><dt><Icon name="calendar" size={18} /></dt><dd>{d?.long || e.date}{end ? ` – ${end.long}` : ''}</dd></div>
                    {e.time && <div><dt><Icon name="clock" size={18} /></dt><dd>{e.time}</dd></div>}
                    {e.venue && <div><dt><Icon name="pin" size={18} /></dt><dd>{e.venue}</dd></div>}
                  </dl>
                  <div className="evd-actions">
                    {e.link && <a className="btn btn-dark" href={e.link} target="_blank" rel="noreferrer noopener">{t('events.details')} <Icon name="arrow" size={16} className="arr" /></a>}
                    <Link className="btn btn-outline" to="/events">{pick('সব ইভেন্ট', 'All events')}</Link>
                  </div>
                </div>
              </div>
              {desc && <div className="evd-body">{desc.split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>}
              {photos.length > 0 && (
                <section className="evd-gallery" aria-labelledby="evd-gallery-h">
                  <h2 id="evd-gallery-h">{pick('ছবি', 'Photos')} <span className="up-count num">{n(photos.length)}</span></h2>
                  <ul>
                    {photos.map((p, i) => (
                      <li key={i}><button type="button" onClick={() => setOpen(i)} aria-label={`${pick('ছবি', 'Photo')} ${n(i + 1)}`}><img src={p.src} srcSet={p.srcSet} sizes="(min-width: 900px) 25vw, 45vw" alt="" loading="lazy" decoding="async" /></button></li>
                    ))}
                  </ul>
                </section>
              )}
              {open != null && photos[open] && (
                <div className="evd-light" role="dialog" aria-modal="true" aria-label={pick('ছবি', 'Photo')} onClick={() => setOpen(null)}
                  onKeyDown={(ev) => { if (ev.key === 'Escape') setOpen(null); if (ev.key === 'ArrowRight') setOpen((open + 1) % photos.length); if (ev.key === 'ArrowLeft') setOpen((open - 1 + photos.length) % photos.length) }} tabIndex={-1} ref={(el) => el?.focus()}>
                  <img src={photos[open].src} srcSet={photos[open].srcSet} sizes="90vw" alt="" onClick={(ev) => ev.stopPropagation()} />
                  <button type="button" className="evd-light-x" onClick={() => setOpen(null)} aria-label={t('nav.close')}>×</button>
                </div>
              )}
            </>
          )
        }}
      </Data>
    </section>
  )
}
