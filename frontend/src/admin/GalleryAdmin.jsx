import { useCallback, useEffect, useRef, useState } from 'react'
import { api, qs, uploadMedia, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Data } from '../components/ui.jsx'
import { Confirm, EmptyState, Field, ImagePicker, Modal, Notice, PageHeader, Pager, SearchBox, Select, SkeletonRows, StatusBadge, slugFrom, useErrText, useFilters, useNotice } from './kit.jsx'

const thumb = (d) => d.imageUrl || (d.image ? `/images/${d.image}-640.webp` : '')
const base = (name) => name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 120)
const STEPS = { queued: 'ad.gal.q.queued', uploading: 'ad.gal.q.uploading', saving: 'ad.gal.q.saving', done: 'ad.gal.q.done', failed: 'ad.gal.q.failed' }

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
  const [queue, setQueue] = useState([])
  const fileInput = useRef(null)
  const albumList = albums.data?.items || []
  const rows = list.data?.items || []
  const current = albumList.find((a) => a.id === f.album)
  const albumName = (a) => pick(a.data.titleBn, a.data.titleEn) || a.title
  useEffect(() => setPicked([]), [f.album, f.q, f.status, f.page, f.limit, f.sort])
  const filtered = !!(f.q || f.status)
  const canReorder = f.sort === 'order' && !filtered && list.data && list.data.pages === 1

  const refresh = () => { list.retry(); albums.retry() }

  /* ---- upload: every file is stored first, and an entry is created only after the server confirms it ---- */
  const patchItem = useCallback((id, patch) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, ...patch } : x))), [])
  const processOne = useCallback(async (item) => {
    patchItem(item.id, { step: 'uploading', progress: 0, error: '' })
    try {
      const up = await uploadMedia({ file: item.file, onProgress: (p) => patchItem(item.id, { progress: p }) })
      patchItem(item.id, { step: 'saving' })
      await api('/admin/content/image', {
        method: 'POST',
        body: JSON.stringify({ parentId: current ? current.id : '', data: { image: up.path, alt: base(item.file.name) || 'Photo', captionEn: '' } }),
      })
      patchItem(item.id, { step: 'done', progress: 100 })
    } catch (e) { patchItem(item.id, { step: 'failed', error: errText(e) }) }
  }, [current, errText, patchItem])
  const startUploads = async (files) => {
    const items = files.map((file, i) => ({ id: `${Date.now()}-${i}`, file, step: 'queued', progress: 0, error: '' }))
    setQueue((q) => [...q.filter((x) => x.step !== 'done'), ...items])
    for (const it of items) await processOne(it) // one at a time keeps progress readable and the server calm
    refresh()
  }
  const pickFiles = (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    const okTypes = files.filter((x) => ['image/jpeg', 'image/png'].includes(x.type) && x.size <= 5 * 1024 * 1024)
    if (okTypes.length !== files.length) bad(t('ad.gal.skipped').replace('{n}', n(files.length - okTypes.length)))
    if (okTypes.length) startUploads(okTypes.slice(0, 20))
  }

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
  const move = (i, d) => {
    const ids = rows.map((r) => r.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    run(() => api('/admin/content/image/reorder', { method: 'POST', body: JSON.stringify({ ids }) }), t('ad.gal.reordered'))
  }
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
  const active = queue.some((x) => ['queued', 'uploading', 'saving'].includes(x.step))

  return (
    <section aria-labelledby="gal-h">
      <PageHeader title={<span id="gal-h">{t('ad.gal.title')}</span>} desc={t('ad.gal.desc')}
        action={
          <div className="row">
            <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png" onChange={pickFiles} hidden />
            <button type="button" className="btn btn-dark btn-sm" disabled={active} onClick={() => fileInput.current?.click()}>+ {t('ad.gal.upload')}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAlbumEdit({})}>+ {t('ad.gal.newAlbum')}</button>
          </div>
        } />
      <Notice notice={notice} onClose={clear} />

      {queue.length > 0 && (
        <div className="ad-queue" role="region" aria-label={t('ad.gal.queue')}>
          <div className="row"><strong>{t('ad.gal.queue')}</strong>
            {!active && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQueue([])}>{t('ad.close')}</button>}</div>
          <ul>
            {queue.map((it) => (
              <li key={it.id}>
                <span className="ad-q-name">{it.file.name}</span>
                <progress max="100" value={it.progress} aria-label={it.file.name} />
                <span className={it.step === 'failed' ? 'err' : 'muted small'}>{t(STEPS[it.step])}{it.error ? `: ${it.error}` : ''}</span>
                {it.step === 'failed' && <button type="button" className="btn btn-ghost btn-sm" disabled={active} onClick={() => processOne(it).then(refresh)}>{t('ad.gal.retry')}</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

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

      <div className="ad-filters">
        <SearchBox value={f.q} onChange={(q) => set({ q })} />
        <Select value={f.status} onChange={(status) => set({ status })} label={t('ad.status')} all={t('ad.status.active')}
          options={[['draft', t('ad.gal.hidden')], ['published', t('ad.status.published')], ['archived', t('ad.status.archived')], ['all', t('ad.status.all')]]} />
        <Select value={f.sort === 'order' ? '' : f.sort} onChange={(v) => set({ sort: v || 'order' })} label={t('ad.sort')} all={t('ad.sort.order')}
          options={[['updated', t('ad.sort.updated')], ['title', t('ad.sort.title')], ['published', t('ad.sort.published')]]} />
      </div>

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
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked([])}>{t('ad.clearSel')}</button>
        </div>
      )}

      {list.loading && <SkeletonRows />}
      {list.error && <Data q={list}>{() => null}</Data>}
      {list.data && (rows.length === 0 ? (
        <EmptyState title={t(filtered ? 'ad.noMatch' : 'ad.gal.none')} text={t(filtered ? 'ad.noMatchHint' : 'ad.gal.noneHint')}
          action={!filtered && <button type="button" className="btn btn-dark btn-sm" onClick={() => fileInput.current?.click()}>+ {t('ad.gal.upload')}</button>} />
      ) : (
        <>
          <ul className="ad-grid-cards">
            {rows.map((r, i) => (
              <li key={r.id} className={`ad-card ${r.status === 'archived' ? 'ad-off' : ''}`}>
                <label className="ad-card-check"><input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`${t('ad.select')} ${r.title}`} /></label>
                <button type="button" className="ad-card-img" onClick={() => setEdit(r)} aria-label={`${t('ad.edit')} ${r.title}`}>
                  {thumb(r.data) ? <img src={thumb(r.data)} alt={r.data.alt || ''} loading="lazy" /> : <span aria-hidden="true">?</span>}
                </button>
                <div className="ad-card-body">
                  <strong title={r.title}>{pick(r.data.captionBn, r.data.captionEn) || r.data.alt || r.title}</strong>
                  <span><StatusBadge status={r.status} label={r.status === 'draft' ? t('ad.gal.hidden') : undefined} /></span>
                  <small className="muted">{(albumList.find((a) => a.id === r.parentId) && albumName(albumList.find((a) => a.id === r.parentId))) || t('ad.gal.noAlbum')}</small>
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
  const { t } = useApp()
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
    const { parentId, imageUrl, ...data } = v
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
    <Modal title={t('ad.gal.editImage')} onClose={() => { if (!dirty || window.confirm(t('ad.leaveConfirm'))) onClose() }} wide busy={busy}>
      <p><StatusBadge status={row.status} label={row.status === 'draft' ? t('ad.gal.hidden') : undefined} /></p>
      <form onSubmit={save} noValidate className="ad-form">
        <ImagePicker label={t('ad.gal.image')} value={v.image} url={v.imageUrl} legacyUrl={v.image && !v.imageUrl ? `/images/${v.image}-640.webp` : undefined}
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
