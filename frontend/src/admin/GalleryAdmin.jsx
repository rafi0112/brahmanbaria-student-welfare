import { useCallback, useEffect, useState } from 'react'
import { api, qs, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Data } from '../components/ui.jsx'
import { Confirm, EmptyState, Field, ImagePicker, Modal, Notice, PageHeader, Pager, SkeletonRows, StatusBadge, slugFrom, useErrText, useFilters, useNotice } from './kit.jsx'
import ListToolbar from './toolbar.jsx'
import MultiUpload from './MultiUpload.jsx'
import VideoPicker from './VideoPicker.jsx'
import { youtubeThumb } from '../lib/video.js'

const thumb = (d) => d.imageUrl || (d.image ? `/images/${d.image}-640.webp` : '') || (d.youtube ? youtubeThumb(d.youtube, 'mqdefault') : '')
const base = (name) => name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 120)

export default function GalleryAdmin() {
  const { t, n, pick } = useApp()
  const errText = useErrText()
  const [f, set] = useFilters({ album: '', q: '', status: '', sort: 'order', page: '1', limit: '24' })
  const albums = useApi('/admin/content/album?status=all&limit=100&sort=order')
  const list = useApi(`/admin/content/image${qs({ q: f.q, status: f.status, sort: f.sort, album: f.album, page: f.page === '1' ? '' : f.page, limit: f.limit })}`)
  const { notice, ok, bad, clear } = useNotice()
  const [picked, setPicked] = useState([])
  const [edit, setEdit] = useState(null)
  const [albumEdit, setAlbumEdit] = useState(null) // entry | {} for new
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [addingVideo, setAddingVideo] = useState(false)
  const [uploadDate, setUploadDate] = useState('') // the date given to every picture of this upload (optional), so they sit under its year
  const [bulkDate, setBulkDate] = useState('')
  const [drag, setDrag] = useState(null) // { from, over } while a picture is being dragged to a new place
  const albumList = albums.data?.items || []
  const rows = list.data?.items || []
  const current = albumList.find((a) => a.id === f.album)
  const albumName = (a) => pick(a.data.titleBn, a.data.titleEn) || a.title
  useEffect(() => setPicked([]), [f.album, f.q, f.status, f.page, f.limit, f.sort])
  const filtered = !!(f.q || f.status)
  // pictures can be put in order (drag and drop, or the arrows) whenever the list shows the gallery's own order; a page or an
  // album is reordered among the places its pictures already hold, so the rest of the gallery keeps its order
  const canReorder = f.sort === 'order' && !filtered && !!list.data

  const refresh = () => { list.retry(); albums.retry() }

  /* ---- upload: many pictures at once; each is optimized, stored once, and gets its own entry once the server confirms it ---- */
  const addEntry = useCallback(async ({ path, file }) => {
    await api('/admin/content/image', {
      method: 'POST',
      body: JSON.stringify({ parentId: current ? current.id : '', data: { image: path, alt: base(file.name) || 'Photo', captionEn: '', ...(uploadDate ? { eventDate: uploadDate } : {}) } }),
    })
  }, [current, uploadDate])

  /* ---- status changes, bulk actions, reordering ---- */
  const run = async (fn, doneText) => {
    setBusy(true); clear()
    try { const r = await fn(); ok(typeof doneText === 'function' ? doneText(r) : doneText); refresh(); return r } catch (e) { bad(errText(e)) } finally { setBusy(false); setConfirm(null) }
    return undefined
  }
  const setStatus = (ids, action) => run(async () => {
    if (ids.length === 1) { await api(`/admin/content/image/${ids[0]}/${action}`, { method: 'POST' }); return { done: 1, failed: [] } }
    const r = await api('/admin/content/image/bulk', { method: 'POST', body: JSON.stringify({ ids, action }) })
    setPicked(r.failed.map((x) => x.id))
    return r
  }, (r) => `${t('ad.bulkDone').replace('{n}', n(r.done))}${r.failed.length ? ` ${t('ad.bulkFailed').replace('{n}', n(r.failed.length))}` : ''}`)
  const move = (i, d) => place(i, i + d)
  // move the picture at `from` to the place `to` (in this list) and save the new order
  const place = (from, to) => {
    if (from === to || from == null || to == null) return
    const ids = rows.map((r) => r.id)
    const [id] = ids.splice(from, 1)
    ids.splice(to, 0, id)
    run(() => api('/admin/content/image/reorder', { method: 'POST', body: JSON.stringify({ ids }) }), t('ad.gal.reordered'))
  }
  const setDate = (date) => run(async () => {
    let done = 0
    const failed = []
    for (const id of picked) {
      try {
        const e = await api(`/admin/content/image/${id}`)
        const { imageUrl, ...data } = e.data
        await api(`/admin/content/image/${id}`, { method: 'PATCH', body: JSON.stringify({ parentId: e.parentId || '', featured: e.featured, sortOrder: e.sortOrder, data: { ...data, eventDate: date } }) })
        done++
      } catch { failed.push({ id }) }
    }
    setPicked(failed.map((x) => x.id))
    return { done, failed }
  }, (r) => `${t('ad.bulkDone').replace('{n}', n(r.done))}${r.failed.length ? ` ${t('ad.bulkFailed').replace('{n}', n(r.failed.length))}` : ''}`)
  const moveToAlbum = (albumId) => run(async () => {
    let done = 0
    const failed = []
    for (const id of picked) {
      try {
        const e = await api(`/admin/content/image/${id}`)
        const { imageUrl, ...data } = e.data
        await api(`/admin/content/image/${id}`, { method: 'PATCH', body: JSON.stringify({ parentId: albumId, featured: e.featured, sortOrder: e.sortOrder, data }) })
        done++
      } catch { failed.push({ id }) }
    }
    setPicked(failed.map((x) => x.id))
    return { done, failed }
  }, (r) => `${t('ad.bulkDone').replace('{n}', n(r.done))}${r.failed.length ? ` ${t('ad.bulkFailed').replace('{n}', n(r.failed.length))}` : ''}`)
  const ask = (action, ids) => setConfirm({ text: t(`ad.confirmBulk.${action}`).replace('{n}', n(ids.length)), action, ids })
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  return (
    <section aria-labelledby="gal-h">
      <PageHeader title={<span id="gal-h">{t('ad.gal.title')}</span>} desc={t('ad.gal.desc')}
        action={
          <div className="row">
            <button type="button" className="btn btn-dark btn-sm" onClick={() => setUploading(true)}>+ {t('ad.gal.upload')}</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setAddingVideo(true)}>+ {pick('ভিডিও যোগ করুন', 'Add a video')}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAlbumEdit({})}>+ {t('ad.gal.newAlbum')}</button>
          </div>
        } />
      <Notice notice={notice} onClose={clear} />

      {uploading && (
        <div className="gal-up-date">
          <label>{pick('এই ছবিগুলোর তারিখ (ঐচ্ছিক)', 'Date of these pictures (optional)')} <input type="date" value={uploadDate} onChange={(e) => setUploadDate(e.target.value)} /></label>
          <small className="muted">{pick('তারিখ দিলে সাইটের গ্যালারিতে ছবিগুলো সেই বছরের নিচে দেখায়। না দিলে প্রকাশের বছর ধরা হয়।', 'With a date the gallery shows these pictures under that year; without one, the year they are published is used.')}</small>
        </div>
      )}
      {addingVideo && <VideoModal albums={albumList.filter((a) => a.status !== 'archived')} albumName={albumName} current={current} onClose={() => setAddingVideo(false)} onAdded={() => { setAddingVideo(false); ok(pick('ভিডিও গ্যালারিতে যোগ হয়েছে। “দেখান” চাপলে সাইটে দেখা যাবে।', 'The video was added to the gallery. Press “Show” to put it on the site.')); refresh() }} />}
      {uploading && <MultiUpload profile="gallery" onStored={addEntry} onFinished={refresh} onClose={() => { setUploading(false); refresh() }} />}

      <div className="chips ad-albums" role="group" aria-label={t('ad.gal.albums')}>
        <button type="button" className={`chip ${f.album === '' ? 'on' : ''}`} aria-pressed={f.album === ''} onClick={() => set({ album: '' })}>{t('ad.gal.allImages')}</button>
        <button type="button" className={`chip ${f.album === 'none' ? 'on' : ''}`} aria-pressed={f.album === 'none'} onClick={() => set({ album: 'none' })}>{t('ad.gal.noAlbum')}</button>
        {albumList.map((a) => (
          <button key={a.id} type="button" className={`chip ${f.album === a.id ? 'on' : ''}`} aria-pressed={f.album === a.id} onClick={() => set({ album: a.id })}>
            {albumName(a)} {a.status !== 'published' && <small>({t(a.status === 'draft' ? 'ad.gal.hidden' : `ad.status.${a.status}`)})</small>}
          </button>
        ))}
      </div>
      {current && (
        <div className="ad-album-card">
          <div><strong>{albumName(current)}</strong> <StatusBadge status={current.status} />{current.data.description && <p className="muted small">{current.data.description}</p>}</div>
          <div className="row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAlbumEdit(current)}>{t('ad.edit')}</button>
          </div>
        </div>
      )}

      <ListToolbar section="gallery" values={f} set={set} defaults={{ sort: 'order', limit: '24' }} total={list.data?.total} loading={list.loading}
        search={{ placeholder: t('ad.gal.search') }}
        views={[
          { id: 'active', label: t('ad.status.activeShort'), patch: { status: '' } }, { id: 'hidden', label: t('ad.gal.hidden'), patch: { status: 'draft' } },
          { id: 'published', label: t('ad.status.published'), patch: { status: 'published' } }, { id: 'archived', label: t('ad.status.archived'), patch: { status: 'archived' } },
        ]}
        sorts={[['order', t('ad.sort.order')], ['updated', t('ad.sort.updated')], ['title', t('ad.sort.title')], ['published', t('ad.sort.published')]]} />

      {picked.length > 0 && (
        <div className="ad-bulk" role="region" aria-label={t('ad.bulk')}>
          <strong>{n(picked.length)} {t('ad.selected')}</strong>
          <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => ask('publish', picked)}>{t('ad.gal.show')}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => ask('unpublish', picked)}>{t('ad.gal.hide')}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => ask('archive', picked)}>{t('ad.act2.archive')}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => ask('restore', picked)}>{t('ad.act2.restore')}</button>
          <select aria-label={t('ad.gal.moveTo')} value="" disabled={busy} onChange={(e) => e.target.value !== '' && moveToAlbum(e.target.value === 'none' ? '' : e.target.value)}>
            <option value="">{t('ad.gal.moveTo')}</option><option value="none">{t('ad.gal.noAlbum')}</option>
            {albumList.filter((a) => a.status !== 'archived').map((a) => <option key={a.id} value={a.id}>{albumName(a)}</option>)}
          </select>
          <span className="gal-bulk-date">
            <input type="date" aria-label={pick('ছবির তারিখ', 'Date of the pictures')} value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !bulkDate} onClick={() => setDate(bulkDate)}>{pick('তারিখ দিন', 'Set the date')}</button>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked([])}>{t('ad.clearSel')}</button>
        </div>
      )}

      {list.loading && <SkeletonRows />}
      {list.error && <Data q={list}>{() => null}</Data>}
      {list.data && (rows.length === 0 ? (
        <EmptyState title={t(filtered ? 'ad.noMatch' : 'ad.gal.none')} text={t(filtered ? 'ad.noMatchHint' : 'ad.gal.noneHint')}
          action={!filtered && <button type="button" className="btn btn-dark btn-sm" onClick={() => setUploading(true)}>+ {t('ad.gal.upload')}</button>} />
      ) : (
        <>
          {canReorder && rows.length > 1 && <p className="muted small">{pick('ক্রম বদলাতে ছবি টেনে অন্য ছবির জায়গায় ছাড়ুন (অথবা ↑ ↓ বোতাম)।', 'To change the order, drag a picture onto the place of another (or use the ↑ ↓ buttons).')}</p>}
          <ul className="ad-grid-cards">
            {rows.map((r, i) => (
              <li key={r.id} className={`ad-card ${r.status === 'archived' ? 'ad-off' : ''}${drag?.from === i ? ' is-dragging' : ''}${drag && drag.over === i && drag.from !== i ? ' is-drop' : ''}`}
                draggable={canReorder && !busy}
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); setDrag({ from: i, over: i }) }}
                onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (drag.over !== i) setDrag({ ...drag, over: i }) }}
                onDrop={(e) => { e.preventDefault(); if (drag) place(drag.from, i); setDrag(null) }}
                onDragEnd={() => setDrag(null)}>
                <label className="ad-card-check"><input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`${t('ad.select')} ${r.title}`} /></label>
                <button type="button" className="ad-card-img" onClick={() => setEdit(r)} aria-label={`${t('ad.edit')} ${r.title}`}>
                  {thumb(r.data) ? <img src={thumb(r.data)} alt={r.data.alt || ''} loading="lazy" /> : r.data.videoUrl ? <video src={`${r.data.videoUrl}#t=0.5`} muted playsInline preload="metadata" /> : <span aria-hidden="true">?</span>}
                  {(r.data.video || r.data.youtube) && <b className="si-kind">{r.data.youtube ? 'YouTube' : pick('ভিডিও', 'Video')}</b>}
                </button>
                <div className="ad-card-body">
                  <strong title={r.title}>{pick(r.data.captionBn, r.data.captionEn) || r.data.alt || r.title}</strong>
                  <span><StatusBadge status={r.status} label={r.status === 'draft' ? t('ad.gal.hidden') : undefined} /></span>
                  <small className="muted">{(albumList.find((a) => a.id === r.parentId) && albumName(albumList.find((a) => a.id === r.parentId))) || t('ad.gal.noAlbum')}{r.data.eventDate ? ` · ${n(r.data.eventDate.slice(0, 4))}` : ''}</small>
                  <div className="row">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(r)}>{t('ad.edit')}</button>
                    {canReorder && <>
                      <button type="button" className="btn btn-ghost btn-sm" aria-label={t('cm.up')} disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button type="button" className="btn btn-ghost btn-sm" aria-label={t('cm.down')} disabled={busy || i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
                    </>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Pager total={list.data.total} page={list.data.page} pages={list.data.pages} limit={f.limit} onPage={(p) => set({ page: p })} onLimit={(limit) => set({ limit })} />
        </>
      ))}

      {edit && <ImageModal row={edit} albums={albumList.filter((a) => a.status !== 'archived')} albumName={albumName}
        onClose={() => setEdit(null)} onChanged={(e, text) => { setEdit(e); ok(text); refresh() }} />}
      {albumEdit && <AlbumModal album={albumEdit.id ? albumEdit : null} onClose={() => setAlbumEdit(null)}
        onChanged={(e, text) => { ok(text); refresh(); if (!albumEdit.id) set({ album: e.id }); setAlbumEdit(e) }} />}
      {confirm && <Confirm text={confirm.text} detail={confirm.action === 'archive' ? <p className="muted small">{t('ad.gal.archiveNote')}</p> : null}
        label={t(confirm.action === 'publish' ? 'ad.gal.show' : confirm.action === 'unpublish' ? 'ad.gal.hide' : `ad.act2.${confirm.action}`)}
        busy={busy} onYes={() => setStatus(confirm.ids, confirm.action)} onNo={() => setConfirm(null)} />}
    </section>
  )
}

/* ---------------------------------------------------------------- one image */

function ImageModal({ row, albums, albumName, onClose, onChanged }) {
  const { t, pick } = useApp()
  const errText = useErrText()
  const init = (r) => ({ ...r.data, parentId: r.parentId || '' })
  const [v, setV] = useState(() => init(row))
  const [errs, setErrs] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  useEffect(() => setV(init(row)), [row])
  const dirty = JSON.stringify(init(row)) !== JSON.stringify(v)
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setErrs({}); setMsg('')
    const { parentId, imageUrl, videoUrl, ...data } = v
    try { onChanged(await api(`/admin/content/image/${row.id}`, { method: 'PATCH', body: JSON.stringify({ parentId, featured: row.featured, sortOrder: row.sortOrder, data }) }), t('ad.saved')) } catch (err) {
      if (err.fields) setErrs(err.fields)
      setMsg(err.fields ? t('ad.e.validation') : errText(err))
    } finally { setBusy(false) }
  }
  const act = async (action) => {
    setBusy(true); setMsg('')
    try { onChanged(await api(`/admin/content/image/${row.id}/${action}`, { method: 'POST' }), t(`ad.done.${action}`)) } catch (err) { setMsg(errText(err)) } finally { setBusy(false); setConfirm(null) }
  }
  return (
    <Modal title={t('ad.gal.editImage')} onClose={() => { if (!dirty || window.confirm(t('ad.leaveConfirm'))) onClose() }} drawer busy={busy}>
      <p><StatusBadge status={row.status} label={row.status === 'draft' ? t('ad.gal.hidden') : undefined} /></p>
      <form onSubmit={save} noValidate className="ad-form">
        {(v.video || v.youtube) && (
          <div className="gal-vedit">
            <strong>{v.youtube ? 'YouTube' : pick('ভিডিও', 'Video')}</strong>
            {v.youtube ? <img src={youtubeThumb(v.youtube, 'mqdefault')} alt="" width="192" height="108" /> : <video src={v.videoUrl} controls preload="metadata" />}
            <details><summary>{pick('ভিডিও বদলান', 'Replace the video')}</summary><VideoPicker compact onPick={(x) => setV({ ...v, video: x.video || '', videoUrl: x.videoUrl || '', youtube: x.youtube || '' })} /></details>
          </div>
        )}
        <ImagePicker profile="gallery" label={v.video || v.youtube ? pick('কভার ছবি (ঐচ্ছিক)', 'Cover picture (optional)') : t('ad.gal.image')} value={v.image} url={v.imageUrl} legacyUrl={v.image && !v.imageUrl ? `/images/${v.image}-640.webp` : undefined}
          onChange={(m) => m && setV({ ...v, image: m.path, imageUrl: m.url })} hint={t('ad.gal.replaceHint')} />
        {errs.image && <small className="err" role="alert">{errs.image}</small>}
        <div className="ad-grid">
          <Field label={t('ad.gal.captionEn')} error={errs.captionEn} max={300} count={(v.captionEn || '').length}>{(id, bad) => <input id={id} value={v.captionEn || ''} onChange={set('captionEn')} maxLength={300} aria-invalid={bad} />}</Field>
          <Field label={t('ad.gal.captionBn')} error={errs.captionBn} max={300} count={(v.captionBn || '').length}>{(id, bad) => <input id={id} value={v.captionBn || ''} onChange={set('captionBn')} maxLength={300} aria-invalid={bad} lang="bn" />}</Field>
        </div>
        <Field label={t('ad.imageAlt')} required error={errs.alt} hint={t('ad.imageAltHint')} max={300} count={(v.alt || '').length}>{(id, bad) => <input id={id} value={v.alt || ''} onChange={set('alt')} maxLength={300} aria-invalid={bad} />}</Field>
        <div className="ad-grid">
          <Field label={t('ad.gal.credit')} error={errs.credit}>{(id, bad) => <input id={id} value={v.credit || ''} onChange={set('credit')} maxLength={120} aria-invalid={bad} />}</Field>
          <Field label={t('ad.gal.license')} error={errs.license}>{(id, bad) => <input id={id} value={v.license || ''} onChange={set('license')} maxLength={80} aria-invalid={bad} />}</Field>
          <Field label={t('ad.gal.source')} error={errs.source}>{(id, bad) => <input id={id} value={v.source || ''} onChange={set('source')} inputMode="url" placeholder="https://" aria-invalid={bad} />}</Field>
          <Field label={t('ad.gal.eventDate')} error={errs.eventDate}>{(id, bad) => <input id={id} type="date" value={v.eventDate || ''} onChange={set('eventDate')} aria-invalid={bad} />}</Field>
          <Field label={t('ad.gal.category')} error={errs.category} hint={t('ad.gal.categoryHint')}>{(id, bad) => <input id={id} value={v.category || ''} onChange={(e) => setV({ ...v, category: slugFrom(e.target.value) })} aria-invalid={bad} />}</Field>
          <Field label={t('ad.gal.album')}>{(id) => (
            <select id={id} value={v.parentId} onChange={set('parentId')}><option value="">{t('ad.gal.noAlbum')}</option>{albums.map((a) => <option key={a.id} value={a.id}>{albumName(a)}</option>)}</select>)}</Field>
        </div>
        {msg && <p className="notice bad" role="alert">{msg}</p>}
        <div className="row">
          <button className="btn btn-dark btn-sm" disabled={busy || !dirty}>{busy ? t('state.loading') : t('ad.save')}</button>
          {row.status !== 'published' && row.status !== 'archived' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy || dirty} onClick={() => act('publish')}>{t('ad.gal.show')}</button>}
          {row.status === 'archived' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy || dirty} onClick={() => act('restore')}>{t('ad.act2.restore')}</button>}
          {row.status === 'published' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy || dirty} onClick={() => act('unpublish')}>{t('ad.gal.hide')}</button>}
          {row.status !== 'archived' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy || dirty} onClick={() => setConfirm('archive')}>{t('ad.act2.archive')}</button>}
        </div>
        {dirty && <p className="muted small">{t('ad.saveFirst')}</p>}
      </form>
      {confirm && <Confirm text={t('ad.gal.confirmArchive')} detail={<p className="muted small">{t('ad.gal.archiveNote')}</p>} label={t('ad.act2.archive')} busy={busy} onYes={() => act('archive')} onNo={() => setConfirm(null)} />}
    </Modal>
  )
}

/* ---------------------------------------------------------------- albums */

// A new gallery video: an uploaded file or a YouTube link, a caption, and optionally an album and a date. It starts
// hidden, like an uploaded picture, until an admin shows it.
function VideoModal({ albums, albumName, current, onClose, onAdded }) {
  const { pick } = useApp()
  const errText = useErrText()
  const [vid, setVid] = useState(null)
  const [f, setF] = useState({ captionBn: '', captionEn: '', parentId: current?.id || '', eventDate: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const save = async () => {
    setBusy(true); setMsg('')
    try {
      await api('/admin/content/image', { method: 'POST', body: JSON.stringify({ parentId: f.parentId, data: { video: vid.video || '', youtube: vid.youtube || '', image: '', captionBn: f.captionBn, captionEn: f.captionEn, alt: f.captionEn || f.captionBn || 'Video', eventDate: f.eventDate } }) })
      onAdded()
    } catch (e) { setMsg(Object.values(e.fields || {})[0] || errText(e)) } finally { setBusy(false) }
  }
  return (
    <Modal title={pick('গ্যালারিতে ভিডিও যোগ করুন', 'Add a video to the gallery')} onClose={onClose} busy={busy}>
      <div className="ad-form">
        {!vid ? <VideoPicker onPick={setVid} /> : (
          <div className="gal-vedit">
            {vid.youtube ? <img src={youtubeThumb(vid.youtube, 'mqdefault')} alt="" width="192" height="108" /> : <video src={vid.videoUrl} controls preload="metadata" />}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVid(null)}>{pick('অন্য ভিডিও বাছুন', 'Choose another video')}</button>
          </div>
        )}
        <div className="ad-grid">
          <Field label={pick('ক্যাপশন (বাংলা)', 'Caption (Bangla)')}>{(id) => <input id={id} value={f.captionBn} maxLength={300} onChange={(e) => setF({ ...f, captionBn: e.target.value })} lang="bn" />}</Field>
          <Field label={pick('ক্যাপশন (ইংরেজি)', 'Caption (English)')}>{(id) => <input id={id} value={f.captionEn} maxLength={300} onChange={(e) => setF({ ...f, captionEn: e.target.value })} />}</Field>
          <Field label={pick('অ্যালবাম', 'Album')}>{(id) => <select id={id} value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}><option value="">{pick('কোনো অ্যালবাম নয়', 'No album')}</option>{albums.map((a) => <option key={a.id} value={a.id}>{albumName(a)}</option>)}</select>}</Field>
          <Field label={pick('তারিখ (ঐচ্ছিক)', 'Date (optional)')}>{(id) => <input id={id} type="date" value={f.eventDate} onChange={(e) => setF({ ...f, eventDate: e.target.value })} />}</Field>
        </div>
        {msg && <p className="notice bad" role="alert">{msg}</p>}
        <div className="row">
          <button type="button" className="btn btn-dark btn-sm" disabled={busy || !vid} onClick={save}>{busy ? pick('সংরক্ষণ হচ্ছে…', 'Saving…') : pick('গ্যালারিতে যোগ করুন', 'Add to the gallery')}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose}>{pick('বাতিল', 'Cancel')}</button>
        </div>
      </div>
    </Modal>
  )
}

function AlbumModal({ album, onClose, onChanged }) {
  const { t } = useApp()
  const errText = useErrText()
  const [v, setV] = useState({ titleEn: album?.data.titleEn || '', titleBn: album?.data.titleBn || '', description: album?.data.description || '', slug: album?.slug || '' })
  const [touched, setTouched] = useState(!!album)
  const [errs, setErrs] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  useEffect(() => { if (!touched) setV((s) => ({ ...s, slug: slugFrom(s.titleEn) })) }, [v.titleEn, touched])
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setErrs({}); setMsg('')
    const body = { slug: v.slug, data: { titleEn: v.titleEn, titleBn: v.titleBn, description: v.description, cover: album?.data.cover || '' } }
    try {
      const r = album ? await api(`/admin/content/album/${album.id}`, { method: 'PATCH', body: JSON.stringify(body) }) : await api('/admin/content/album', { method: 'POST', body: JSON.stringify(body) })
      onChanged(r, t('ad.saved'))
    } catch (err) {
      if (err.fields) setErrs(err.fields)
      setMsg(err.fields ? t('ad.e.validation') : errText(err))
    } finally { setBusy(false) }
  }
  const act = async (action) => {
    setBusy(true); setMsg('')
    try { onChanged(await api(`/admin/content/album/${album.id}/${action}`, { method: 'POST' }), t(`ad.done.${action}`)) } catch (err) { setMsg(errText(err)) } finally { setBusy(false); setConfirm(null) }
  }
  return (
    <Modal title={t(album ? 'ad.gal.editAlbum' : 'ad.gal.newAlbum')} onClose={onClose} busy={busy}>
      {album && <p><StatusBadge status={album.status} label={album.status === 'draft' ? t('ad.gal.hidden') : undefined} /></p>}
      <form onSubmit={save} noValidate className="ad-form">
        <Field label={t('ad.titleEn')} required error={errs.titleEn} max={120} count={v.titleEn.length}>{(id, bad) => <input id={id} value={v.titleEn} onChange={set('titleEn')} maxLength={120} aria-invalid={bad} />}</Field>
        <Field label={t('ad.titleBn')} error={errs.titleBn} max={120} count={v.titleBn.length}>{(id, bad) => <input id={id} value={v.titleBn} onChange={set('titleBn')} maxLength={120} aria-invalid={bad} lang="bn" />}</Field>
        <Field label={t('ad.slug')} error={errs.slug} hint={t('ad.slugHint')}>{(id, bad) => <input id={id} value={v.slug} onChange={(e) => { setTouched(true); setV({ ...v, slug: e.target.value.toLowerCase() }) }} maxLength={80} aria-invalid={bad} />}</Field>
        <Field label={t('ad.gal.albumDesc')} error={errs.description} max={500} count={v.description.length}>{(id, bad) => <textarea id={id} rows={2} value={v.description} onChange={set('description')} maxLength={500} aria-invalid={bad} />}</Field>
        {msg && <p className="notice bad" role="alert">{msg}</p>}
        <div className="row">
          <button className="btn btn-dark btn-sm" disabled={busy}>{busy ? t('state.loading') : t('ad.save')}</button>
          {album && album.status !== 'published' && album.status !== 'archived' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act('publish')}>{t('ad.gal.show')}</button>}
          {album && album.status === 'published' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act('unpublish')}>{t('ad.gal.hide')}</button>}
          {album && album.status === 'archived' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act('restore')}>{t('ad.act2.restore')}</button>}
          {album && album.status !== 'archived' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirm(true)}>{t('ad.act2.archive')}</button>}
        </div>
        {album && <p className="muted small">{t('ad.gal.albumNote')}</p>}
      </form>
      {confirm && <Confirm text={t('ad.gal.confirmArchiveAlbum')} label={t('ad.act2.archive')} busy={busy} onYes={() => act('archive')} onNo={() => setConfirm(null)} />}
    </Modal>
  )
}
