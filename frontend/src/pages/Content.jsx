import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import images from '../data/images.json'
import { api, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useBase } from '../lib/base.js'
import { Badge, Credit, Crumbs, Data, Empty, MediaPhoto, PageHero } from '../components/ui.jsx'
import Markdown from '../components/Markdown.jsx'
import { PostCard } from '../components/cards.jsx'
import { Plane } from '../components/Sketch.jsx'

/* ---------------- Blog ---------------- */
export function Blog() {
  const base = useBase()
  const { t, pick } = useApp()
  const [sp, setSp] = useSearchParams()
  const cat = sp.get('category') || ''
  const res = useApi(`/blog${cat ? `?category=${cat}` : ''}`)
  const cats = ['student-life', 'heritage', 'community']
  return (
    <>
      <PageHero kicker={t('blog.kicker')} title={t('blog.title')} lede={t('blog.lede')} image="titas-morning">
        <div className="banner-chips" role="group">
          <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setSp({})}>{t('blog.all')}</button>
          {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setSp({ category: c })}>{t(`cat.${c}`)}</button>)}
        </div>
      </PageHero>
      <section className="section wrap">
        <Data q={res}>
          {(d) => d.items.length === 0 ? <Empty /> : (
            <div className="blog-layout">
              <PostCard p={d.items[0]} big />
              <div className="blog-side">
                {d.items.slice(1).map((p) => (
                  <Link key={p.slug} to={`${base}/blog/${p.slug}`} className="post-row">
                    <MediaPhoto id={p.image} url={p.imageUrl} shape="shape-a" sizes="160px" />
                    <div><h3>{pick(p.titleBn, p.titleEn)}</h3><small className="muted">{p.date}</small></div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Data>
      </section>
    </>
  )
}

export function BlogPost() {
  const base = useBase()
  const { slug } = useParams()
  const { t, pick, n } = useApp()
  const res = useApi(`/blog/${slug}`)
  const more = useApi('/blog')
  return (
    <section className="section wrap narrow">
      <Data q={res}>
        {(p) => (
          <article className="article">
            <Crumbs items={[{ to: '/', label: t('nav.home') }, { to: `${base}/blog`, label: t('nav.blog') }, { label: pick(p.titleBn, p.titleEn) }]} />
            <div className="row"><Badge tone="gold">{t(`cat.${p.category}`)}</Badge>{p.sample && <Badge tone="muted">{t('blog.sample')}</Badge>}</div>
            <h1>{pick(p.titleBn, p.titleEn)}</h1>
            <p className="muted">{p.author} · {p.date} · {n(p.readMin)} {t('blog.min')}</p>
            <MediaPhoto id={p.image} url={p.imageUrl} alt={p.imageAlt} shape="shape-a" sketch eager sizes="(min-width: 900px) 720px, 95vw" />
            {!p.imageUrl && <Credit id={p.image} />}
            <div className="prose"><Markdown text={pick(p.bodyBn, p.bodyEn).join('\n\n')} /></div>
            <Link className="link-arrow" to={`${base}/blog`}>← {t('blog.back')}</Link>
            <h2>{t('blog.latest')}</h2>
            <div className="cards-2">{(more.data?.items || []).filter((x) => x.slug !== p.slug).slice(0, 2).map((x) => <PostCard key={x.slug} p={x} />)}</div>
          </article>
        )}
      </Data>
    </section>
  )
}

/* ---------------- Gallery ---------------- */
export function Gallery() {
  const { t, pick } = useApp()
  const res = useApi('/gallery')
  const [album, setAlbum] = useState('')
  const [open, setOpen] = useState(null)
  const closeRef = useRef(null)
  const all = res.data?.items || []
  const albums = res.data?.albums || []
  const items = album ? all.filter((i) => i.album === album) : all
  const caption = (i) => pick(i.captionBn, i.captionEn) || i.alt
  useEffect(() => {
    if (open == null) return undefined
    closeRef.current?.focus()
    const key = (e) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen((i) => (i + 1) % items.length)
      if (e.key === 'ArrowLeft') setOpen((i) => (i - 1 + items.length) % items.length)
    }
    addEventListener('keydown', key)
    document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', key); document.body.style.overflow = '' }
  }, [open, items.length])
  const m = open != null ? items[open] : null
  return (
    <>
      <PageHero kicker={t('gallery.kicker')} title={t('gallery.title')} lede={t('gallery.lede')} image="dhoranti-sarail" />
      <section className="section wrap">
        <Data q={res}>
          {() => all.length === 0 ? <Empty>{t('gallery.empty')}</Empty> : (
            <>
              {albums.length > 0 && (
                <div className="chips" role="group" aria-label={t('gallery.albums')}>
                  <button className={`chip ${album === '' ? 'on' : ''}`} aria-pressed={album === ''} onClick={() => setAlbum('')}>{t('gallery.all')}</button>
                  {albums.map((a) => <button key={a.id} className={`chip ${album === a.id ? 'on' : ''}`} aria-pressed={album === a.id} onClick={() => setAlbum(a.id)}>{pick(a.titleBn, a.titleEn)}</button>)}
                </div>
              )}
              <div className="masonry">
                {items.map((it, i) => (
                  <button key={it.id} className="masonry-item" onClick={() => setOpen(i)} aria-label={caption(it)}>
                    <MediaPhoto id={it.image} url={it.imageUrl} alt={it.alt || caption(it)} shape={`shape-${['a', 'b', 'c'][i % 3]}`} sizes="(min-width: 900px) 25vw, 50vw" />
                    <span>{caption(it)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Data>
      </section>
      {m && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={caption(m)} onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <button ref={closeRef} className="icon-btn lb-close" onClick={() => setOpen(null)} aria-label={t('gallery.close')}>✕</button>
          <button className="icon-btn lb-prev" onClick={() => setOpen((open - 1 + items.length) % items.length)} aria-label={t('gallery.prev')}>‹</button>
          <figure>
            <img src={m.imageUrl || `/images/${m.image}-1280.webp`} alt={m.alt || caption(m)} />
            <figcaption>
              <strong>{caption(m)}</strong>
              {(m.credit || m.license || m.source) && (
                <span>
                  {m.credit && <>{t('place.photoCredit')}: {m.credit}</>}
                  {m.license && <> · {t('gallery.license')}: {m.license}</>}
                  {m.source && <> · <a href={m.source} target="_blank" rel="noreferrer">{t('gallery.source')}</a></>}
                </span>
              )}
            </figcaption>
          </figure>
          <button className="icon-btn lb-next" onClick={() => setOpen((open + 1) % items.length)} aria-label={t('gallery.next')}>›</button>
        </div>
      )}
    </>
  )
}

/* ---------------- About ---------------- */
export function About() {
  const { t } = useApp()
  const stats = useApi('/stats')
  const { n } = useApp()
  const s = stats.data
  const values = [['v1', 'M9 8a3 3 0 1 0 0-.1M3 20c.7-3.6 3.2-5.5 6-5.5s5.3 1.9 6 5.5'], ['v2', 'M3 20h18M5 20V10M19 20V10M3 10l9-6 9 6'], ['v3', 'M3 10l9-5 9 5-9 5zM7 12v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4'], ['v4', 'M6 11V8a6 6 0 0 1 12 0v3M5 11h14v9H5z']]
  return (
    <>
      <PageHero kicker={t('about.kicker')} title={t('about.title')} lede={t('about.p1')} image="bb-sunset" />
      <section className="section wrap two-col">
        <div>
          <p className="lede">{t('about.p2')}</p>
          <h2>{t('about.mission')}</h2>
          <ul className="ticks">{['m1', 'm2', 'm3', 'm4'].map((k) => <li key={k}>{t(`about.${k}`)}</li>)}</ul>
        </div>
        <div className="sketch-card"><img src="/art/heritage.webp" alt="" loading="lazy" /><img src="/art/students.webp" alt="" loading="lazy" /></div>
      </section>
      <section className="section wrap">
        <h2>{t('about.values')}</h2>
        <div className="values">
          {values.map(([k, d]) => (
            <div key={k} className="value">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
              <h3>{t(`about.${k}`)}</h3><p className="muted">{t(`about.${k}d`)}</p>
            </div>
          ))}
        </div>
        <div className="stats-strip about-stats">
          <dl>
            {[['students', s?.students], ['batches', s?.batches], ['upazilas', s?.upazilas], ['places', s?.places]].map(([k, v]) => (
              <div key={k}><dt>{t(`stat.${k}`)}</dt><dd className="num">{v != null ? n(v) : '–'}</dd></div>
            ))}
          </dl>
        </div>
      </section>
    </>
  )
}

/* ---------------- Contact ---------------- */
export function Contact() {
  const { t } = useApp()
  const [v, setV] = useState({ name: '', email: '', subject: '', message: '', website: '' })
  const [st, setSt] = useState({ status: 'idle', fields: {} })
  const on = (k) => (e) => setV({ ...v, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    setSt({ status: 'sending', fields: {} })
    try {
      await api('/contact', { method: 'POST', body: JSON.stringify(v) })
      setSt({ status: 'ok', fields: {} })
      setV({ name: '', email: '', subject: '', message: '', website: '' })
    } catch (err) {
      setSt({ status: err.status === 429 ? 'limit' : err.fields ? 'invalid' : 'fail', fields: err.fields || {} })
    }
  }
  const field = (k, label, props = {}) => (
    <label className="field">
      <span>{label}</span>
      {props.area ? <textarea rows="6" value={v[k]} onChange={on(k)} aria-invalid={!!st.fields[k]} required /> : <input type={props.type || 'text'} value={v[k]} onChange={on(k)} aria-invalid={!!st.fields[k]} required />}
      {st.fields[k] && <small className="err">{st.fields[k]}</small>}
    </label>
  )
  return (
    <>
      <PageHero kicker={t('contact.kicker')} title={t('contact.title')} lede={t('contact.lede')} image="alinagar-fair" />
      <section className="section wrap two-col">
        <form className="card-form" onSubmit={submit} noValidate>
          {field('name', t('contact.name'))}
          {field('email', t('contact.email'), { type: 'email' })}
          {field('subject', t('contact.subject'))}
          {field('message', t('contact.message'), { area: true })}
          <input className="hp" tabIndex="-1" autoComplete="off" aria-hidden="true" value={v.website} onChange={on('website')} name="website" />
          <button className="btn btn-dark" disabled={st.status === 'sending'}>{st.status === 'sending' ? t('contact.sending') : t('contact.send')}</button>
          <div aria-live="polite">
            {st.status === 'ok' && <p className="notice ok">{t('contact.ok')}</p>}
            {st.status === 'fail' && <p className="notice bad">{t('contact.fail')}</p>}
            {st.status === 'limit' && <p className="notice bad">{t('contact.limit')}</p>}
          </div>
        </form>
        <div className="sketch-card"><img src="/art/landscape.webp" alt="" loading="lazy" /><Plane className="sketch plane" /><p className="muted">{t('contact.address')}</p></div>
      </section>
    </>
  )
}

export function NotFound() {
  const { t } = useApp()
  return (
    <section className="section wrap narrow center">
      <h1>{t('nf.title')}</h1><p className="lede">{t('nf.body')}</p>
      <Link className="btn btn-dark" to="/">{t('nf.home')}</Link>
    </section>
  )
}
