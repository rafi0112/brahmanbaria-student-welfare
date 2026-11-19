import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { optimizeImage } from '../lib/imageOptimize.js'
import Icon from './Icon.jsx'
import { toast } from './Motion.jsx'

// On the Blog page: a signed-in member sends a title, the text and up to six pictures. It is saved for the admins (like
// a contact message); nothing is published until an admin makes a post from it. Pictures are made smaller in the
// browser first, so even phone photos go quickly. The text being written is kept in this browser until it is sent.

const MAX_PHOTOS = 6
const DRAFT_KEY = 'bswa-blog-draft'
const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {} } catch { return {} } }
const STATUS = { new: 'blogw.st.new', read: 'blogw.st.read', accepted: 'blogw.st.accepted', declined: 'blogw.st.declined' }

export default function BlogWrite() {
  const { t, n } = useApp()
  const auth = useAuth()
  const loc = useLocation()
  const box = useRef(null)
  useEffect(() => { // "/blog#write" (for example after signing in) brings the form into view
    if (loc.hash === '#write' && !auth.loading) setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }, [loc.hash, auth.loading])

  if (auth.loading) return null
  return (
    <section className="section wrap bw" id="write" ref={box} aria-labelledby="bw-h">
      <div className="bw-head">
        <p className="eyebrow">{t('blogw.kicker')}</p>
        <h2 id="bw-h">{t('blogw.title')}</h2>
        <p className="muted">{t('blogw.lede')}</p>
      </div>
      {auth.user ? <WriteForm /> : (
        <div className="bw-card bw-signin">
          <span className="bw-ico"><Icon name="lock" size={22} /></span>
          <div>
            <h3>{t('blogw.signInT')}</h3>
            <p className="muted">{t('blogw.signInD')}</p>
          </div>
          <div className="bw-signin-btns">
            <Link className="btn btn-dark" to={`/login?next=${encodeURIComponent('/blog#write')}`}>{t('nav.login')}</Link>
            <Link className="btn btn-outline" to="/register">{t('nav.register')}</Link>
          </div>
        </div>
      )}
      {auth.user && <MySubmissions n={n} />}
    </section>
  )
}

function WriteForm() {
  const { t, n } = useApp()
  const [v, setV] = useState(() => ({ title: '', body: '', ...readDraft() }))
  const [photos, setPhotos] = useState([]) // { id, file, url }
  const [st, setSt] = useState({ status: 'idle', fields: {}, msg: '' })
  const [over, setOver] = useState(false)
  const input = useRef(null)

  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)) } catch { /* private window */ } }, [v])
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const add = (list) => {
    const files = [...list].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type))
    const skipped = list.length - files.length
    setPhotos((cur) => {
      const room = MAX_PHOTOS - cur.length
      if (files.length > room || skipped) setSt((s) => ({ ...s, msg: files.length > room ? t('blogw.tooMany') : t('blogw.onlyPhotos') }))
      return [...cur, ...files.slice(0, Math.max(0, room)).map((file, i) => ({ id: `${Date.now()}-${i}-${file.name}`, file, url: URL.createObjectURL(file) }))]
    })
  }
  const remove = (id) => setPhotos((cur) => cur.filter((p) => { if (p.id === id) URL.revokeObjectURL(p.url); return p.id !== id }))
  const move = (i, d) => setPhotos((cur) => { const a = [...cur]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a })

  const submit = async (e) => {
    e.preventDefault()
    const fields = {}
    if (v.title.trim().length < 3) fields.title = t('blogw.needTitle')
    if (v.body.trim().length < 20) fields.body = t('blogw.needBody')
    if (Object.keys(fields).length) { setSt({ status: 'invalid', fields, msg: '' }); return }
    setSt({ status: 'preparing', fields: {}, msg: '' })
    const form = new FormData()
    form.append('title', v.title)
    form.append('body', v.body)
    try {
      for (const [i, p] of photos.entries()) {
        let blob = p.file
        let ext = p.file.type === 'image/png' ? '.png' : '.jpg'
        try { const o = await optimizeImage(p.file, 'gallery'); blob = o.blob; ext = o.ext } catch (err) {
          if (['corrupt', 'dimensions', 'type', 'empty', 'svg', 'gif', 'too_big'].includes(err.code)) throw Object.assign(new Error('photo'), { photo: i + 1 })
        }
        form.append('photos', blob, `photo-${i + 1}${ext}`)
      }
      setSt({ status: 'sending', fields: {}, msg: '' })
      await api('/me/blog-submissions', { method: 'POST', body: form })
      photos.forEach((p) => URL.revokeObjectURL(p.url))
      setPhotos([]); setV({ title: '', body: '' })
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* */ }
      setSt({ status: 'ok', fields: {}, msg: '' })
      toast('blogw.toast')
      dispatchEvent(new Event('blogw-sent'))
    } catch (err) {
      if (err.photo) { setSt({ status: 'invalid', fields: { photos: t('blogw.badPhotoN').replace('{n}', n(err.photo)) }, msg: '' }); return }
      const f = err.fields || {}
      setSt({ status: err.status === 429 ? 'limit' : err.status === 413 ? 'big' : err.fields ? 'invalid' : 'fail', fields: { ...(f.title && { title: t('blogw.needTitle') }), ...(f.body && { body: t('blogw.needBody') }), ...(f.photos && { photos: t('blogw.badPhoto') }) }, msg: '' })
    }
  }

  if (st.status === 'ok') {
    return (
      <div className="bw-card contact-done" role="status">
        <span className="contact-done-ico"><Icon name="check" size={26} /></span>
        <h3>{t('blogw.doneT')}</h3>
        <p className="muted">{t('blogw.doneD')}</p>
        <div className="row">
          <button type="button" className="btn btn-outline" onClick={() => setSt({ status: 'idle', fields: {}, msg: '' })}>{t('blogw.another')}</button>
          <button type="button" className="btn btn-ghost" onClick={() => document.getElementById('bw-mine')?.scrollIntoView({ behavior: 'smooth' })}>{t('blogw.mineT')}</button>
        </div>
      </div>
    )
  }
  const busy = st.status === 'preparing' || st.status === 'sending'
  const chars = v.body.trim().length
  return (
    <form className="bw-card bw-form" onSubmit={submit} noValidate aria-busy={busy || undefined}>
      <label className="field">
        <span>{t('blogw.titleL')}</span>
        <input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={160} aria-invalid={!!st.fields.title} placeholder={t('blogw.titleP')} />
        {st.fields.title && <small className="err">{st.fields.title}</small>}
      </label>
      <label className="field">
        <span>{t('blogw.bodyL')}</span>
        <textarea rows="10" value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} maxLength={20000} aria-invalid={!!st.fields.body} aria-describedby="bw-body-h" />
        <small id="bw-body-h" className="muted bw-hint"><span>{t('blogw.bodyH')}</span><span aria-live="off">{n(chars)} / {n(20000)}</span></small>
        {st.fields.body && <small className="err">{st.fields.body}</small>}
      </label>

      <div className="field">
        <span id="bw-ph-l">{t('blogw.photosL')} <small className="muted">({n(photos.length)}/{n(MAX_PHOTOS)})</small></span>
        <div className={`bw-drop ${over ? 'is-over' : ''}`} role="group" aria-labelledby="bw-ph-l"
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files) }}>
          {photos.length > 0 && (
            <ul className="bw-thumbs">
              {photos.map((p, i) => (
                <li key={p.id}>
                  <img src={p.url} alt="" />
                  {i === 0 && <span className="bw-cover">{t('blogw.cover')}</span>}
                  <div className="bw-thumb-btns">
                    {i > 0 && <button type="button" onClick={() => move(i, -1)} aria-label={t('blogw.left')} title={t('blogw.left')}>‹</button>}
                    {i < photos.length - 1 && <button type="button" onClick={() => move(i, 1)} aria-label={t('blogw.right')} title={t('blogw.right')}>›</button>}
                    <button type="button" className="bw-x" onClick={() => remove(p.id)} aria-label={`${t('blogw.remove')} ${n(i + 1)}`} title={t('blogw.remove')}>×</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {photos.length < MAX_PHOTOS && (
            <button type="button" className="bw-pick" onClick={() => input.current?.click()}>
              <Icon name="image" size={22} />
              <b>{t('blogw.pick')}</b>
              <small className="muted">{t('blogw.photosH')}</small>
            </button>
          )}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        </div>
        {st.msg && <small className="muted">{st.msg}</small>}
        {st.fields.photos && <small className="err">{st.fields.photos}</small>}
      </div>

      <div className="contact-actions">
        <button className="btn btn-dark" disabled={busy} aria-busy={busy || undefined}>
          {st.status === 'preparing' ? t('blogw.preparing') : st.status === 'sending' ? t('blogw.sending') : t('blogw.send')} <Icon name="arrow" size={16} className="arr" />
        </button>
        <p className="muted small">{t('blogw.note')}</p>
      </div>
      <div aria-live="polite">
        {st.status === 'invalid' && <p className="notice bad">{t('blogw.invalid')}</p>}
        {st.status === 'fail' && <p className="notice bad">{t('blogw.fail')}</p>}
        {st.status === 'limit' && <p className="notice bad">{t('blogw.limit')}</p>}
        {st.status === 'big' && <p className="notice bad">{t('blogw.big')}</p>}
      </div>
    </form>
  )
}

function MySubmissions({ n }) {
  const { t, lang } = useApp()
  const res = useApi('/me/blog-submissions')
  const { retry } = res
  useEffect(() => { addEventListener('blogw-sent', retry); return () => removeEventListener('blogw-sent', retry) }, [retry])
  const items = res.data?.items || []
  if (!items.length) return null
  return (
    <div className="bw-mine" id="bw-mine">
      <h3>{t('blogw.mineT')}</h3>
      <ul>
        {items.map((x) => (
          <li key={x.id}>
            <div><b>{x.title}</b><small className="muted">{new Date(x.createdAt).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {n(x.photos)} {t('blogw.photosN')}</small></div>
            <span className={`bw-st bw-st-${x.status}`}>{t(STATUS[x.status] || STATUS.new)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
