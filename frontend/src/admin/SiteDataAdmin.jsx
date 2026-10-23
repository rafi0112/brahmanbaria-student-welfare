import { useState } from 'react'
import { api, qs, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Data } from '../components/ui.jsx'
import { Confirm, EmptyState, Field, ImagePicker, Modal, Notice, PageHeader, Pager, RowMenu, SkeletonRows, StatusBadge, useErrText, useFilters, useNotice, useWhen } from './kit.jsx'
import ListToolbar from './toolbar.jsx'
import DataTable from './DataTable.jsx'
import Icon from './icons.jsx'

// Admin pages for the rest of the site's data, all stored in the database: events, FAQ questions, departments,
// upazilas (editorial entries) and alumni (directory records). Each page lists, adds, edits, publishes or removes.

const STATUS_VIEWS = (t) => [
  { id: 'active', label: t('ad.status.activeShort'), patch: { status: '' } },
  { id: 'published', label: t('ad.status.published'), patch: { status: 'published' } },
  { id: 'draft', label: t('ad.status.draft'), patch: { status: 'draft' } },
  { id: 'archived', label: t('ad.status.archived'), patch: { status: 'archived' } },
]

// One list of editorial entries of `kind`, with an editor dialog given by `Editor` and table `columns(t)`.
function EntryAdmin({ kind, titleKey, descKey, addKey, columns, Editor, blank, search = true, views = true }) {
  const { t, lang } = useApp()
  const when = useWhen(lang)
  const errText = useErrText()
  const [f, set] = useFilters({ q: '', status: '', page: '1', limit: '20' })
  const list = useApi(`/admin/content/${kind}${qs({ ...f, sort: 'order', page: f.page === '1' ? '' : f.page })}`)
  const { notice, ok, bad, clear } = useNotice()
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const rows = list.data?.items || []
  const act = async (r, action, done) => {
    setBusy(true); clear()
    try { await api(`/admin/content/${kind}/${r.id}/${action}`, { method: 'POST', body: '{}' }); ok(t(done)); list.retry() }
    catch (e) { bad(errText(e)) } finally { setBusy(false); setConfirm(null) }
  }
  const move = async (i, dir) => {
    const ids = rows.map((r) => r.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    setBusy(true)
    try { await api(`/admin/content/${kind}/reorder`, { method: 'POST', body: JSON.stringify({ ids }) }); list.retry() }
    catch (e) { bad(errText(e)) } finally { setBusy(false) }
  }
  return (
    <section>
      <PageHeader title={t(titleKey)} desc={t(descKey)}
        action={<button type="button" className="btn btn-dark" onClick={() => setEdit(blank)}><Icon name="plus" size={16} /> {t(addKey)}</button>} />
      <ListToolbar section={kind} values={f} set={set} defaults={{ limit: '20' }} total={list.data?.total} loading={list.loading}
        search={search ? { placeholder: t('ad.sd.search') } : undefined} views={views ? STATUS_VIEWS(t) : []} />
      <Notice notice={notice} onClose={clear} />
      {list.loading && <SkeletonRows />}
      {list.error && <Data q={list}>{() => null}</Data>}
      {list.data && (rows.length === 0 ? <EmptyState title={t('ad.sd.none')} text={t('ad.sd.noneHint')} /> : (
        <>
          <DataTable caption={t(titleKey)} rows={rows} rowKey={(r) => r.id}
            columns={[
              ...columns(t, when),
              { id: 'status', label: t('ad.stu.col.status'), width: '130px', cell: (r) => <StatusBadge status={r.status} /> },
              { id: 'actions', srLabel: t('ad.actions'), width: '150px', className: 'dt-actions-cell', cell: (r) => {
                const i = rows.indexOf(r)
                return (
                  <div className="dt-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(r)}>{t('ad.edit')}</button>
                    <RowMenu label={`${t('ad.actions')}: ${r.title}`} items={[
                      r.status !== 'published' && r.status !== 'archived' && { label: t('ad.sd.publish'), icon: 'check', onClick: () => act(r, 'publish', 'ad.sd.published') },
                      r.status === 'published' && { label: t('ad.sd.unpublish'), icon: 'down', onClick: () => act(r, 'unpublish', 'ad.sd.unpublished') },
                      i > 0 && { label: t('ad.sd.moveUp'), icon: 'up', onClick: () => move(i, -1) },
                      i < rows.length - 1 && { label: t('ad.sd.moveDown'), icon: 'down', onClick: () => move(i, 1) },
                      r.status !== 'archived'
                        ? { label: t('ad.sd.remove'), icon: 'trash', danger: true, sep: true, onClick: () => setConfirm(r) }
                        : { label: t('ad.sd.restore'), icon: 'up', sep: true, onClick: () => act(r, 'restore', 'ad.sd.restored') },
                    ]} />
                  </div>
                )
              } },
            ]} />
          <Pager total={list.data.total} page={list.data.page} pages={list.data.pages} limit={f.limit} onPage={(p) => set({ page: p })} onLimit={(limit) => set({ limit })} />
        </>
      ))}
      {edit && <Editor row={edit.id ? edit : null} busy={busy}
        onClose={() => setEdit(null)}
        onSaved={(publishNow) => { setEdit(null); ok(t(publishNow ? 'ad.sd.savedPublished' : 'ad.sd.saved')); list.retry() }} kind={kind} />}
      {confirm && <Confirm tone="danger" title={t('ad.sd.remove')} text={t('ad.sd.removeText').replace('{what}', confirm.title)} label={t('ad.sd.remove')} busy={busy}
        onYes={() => act(confirm, 'archive', 'ad.sd.removed')} onNo={() => setConfirm(null)} />}
    </section>
  )
}

// Shared save logic for the entry editors: create or update, then publish when asked.
function useEntrySave(kind, row, onSaved) {
  const errText = useErrText()
  const [errs, setErrs] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (data, { slug, publish } = {}) => {
    setBusy(true); setErrs({}); setMsg('')
    try {
      const body = JSON.stringify({ data, ...(slug != null ? { slug } : {}), ...(row ? { expectedUpdatedAt: row.updatedAt } : {}) })
      const e = await api(row ? `/admin/content/${kind}/${row.id}` : `/admin/content/${kind}`, { method: row ? 'PATCH' : 'POST', body })
      if (publish && e.status !== 'published') await api(`/admin/content/${kind}/${e.id}/publish`, { method: 'POST', body: '{}' })
      onSaved(publish)
    } catch (err) {
      if (err.fields) setErrs(err.fields); else setMsg(errText(err))
    } finally { setBusy(false) }
  }
  return { errs, msg, busy, save }
}

function SaveRow({ busy, row, onClose, onSave }) {
  const { t } = useApp()
  return (
    <div className="row">
      <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => onSave(true)}>{busy ? t('state.loading') : t(row?.status === 'published' ? 'ad.sd.save' : 'ad.sd.saveAndPublish')}</button>
      {row?.status !== 'published' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onSave(false)}>{t('ad.sd.saveDraft')}</button>}
      <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={onClose}>{t('admin.roles.cancel')}</button>
    </div>
  )
}

const text = (v, set, k) => ({ value: v[k] ?? '', onChange: (e) => set({ ...v, [k]: e.target.value }) })

/* ---------------------------------------------------------------- events */

function EventEditor({ row, onClose, onSaved, kind }) {
  const { t } = useApp()
  const d = row?.data || {}
  const [v, setV] = useState({ titleEn: d.titleEn || '', titleBn: d.titleBn || '', date: d.date || '', endDate: d.endDate || '', time: d.time || '', venue: d.venue || '',
    summaryEn: d.summaryEn || '', summaryBn: d.summaryBn || '', image: d.image || '', imageUrl: d.imageUrl || '', link: d.link || '' })
  const { errs, msg, busy, save } = useEntrySave(kind, row, onSaved)
  const { imageUrl, ...data } = v
  return (
    <Modal title={t(row ? 'ad.ev.edit' : 'ad.ev.add')} onClose={onClose} drawer busy={busy}>
      <div className="ad-grid-2">
        <Field label={t('ad.ev.titleEn')} required error={errs.titleEn}>{(id, bad) => <input id={id} {...text(v, setV, 'titleEn')} aria-invalid={bad} maxLength={160} />}</Field>
        <Field label={t('ad.ev.titleBn')} error={errs.titleBn}>{(id, bad) => <input id={id} lang="bn" {...text(v, setV, 'titleBn')} aria-invalid={bad} maxLength={160} />}</Field>
        <Field label={t('ad.ev.date')} required error={errs.date}>{(id, bad) => <input id={id} type="date" {...text(v, setV, 'date')} aria-invalid={bad} />}</Field>
        <Field label={t('ad.ev.endDate')} error={errs.endDate}>{(id, bad) => <input id={id} type="date" {...text(v, setV, 'endDate')} aria-invalid={bad} />}</Field>
        <Field label={t('ad.ev.time')} error={errs.time}>{(id, bad) => <input id={id} type="time" {...text(v, setV, 'time')} aria-invalid={bad} />}</Field>
        <Field label={t('ad.ev.venue')} error={errs.venue}>{(id, bad) => <input id={id} {...text(v, setV, 'venue')} aria-invalid={bad} maxLength={160} />}</Field>
      </div>
      <Field label={t('ad.ev.summaryEn')} error={errs.summaryEn} count={v.summaryEn.length} max={2000}>{(id, bad) => <textarea id={id} rows={4} {...text(v, setV, 'summaryEn')} aria-invalid={bad} maxLength={2000} />}</Field>
      <Field label={t('ad.ev.summaryBn')} error={errs.summaryBn} count={v.summaryBn.length} max={2000}>{(id, bad) => <textarea id={id} lang="bn" rows={4} {...text(v, setV, 'summaryBn')} aria-invalid={bad} maxLength={2000} />}</Field>
      <Field label={t('ad.ev.link')} error={errs.link} hint="https://…">{(id, bad) => <input id={id} type="url" {...text(v, setV, 'link')} aria-invalid={bad} />}</Field>
      <ImagePicker label={t('ad.ev.image')} value={v.image} url={imageUrl} onChange={(m) => setV({ ...v, image: m ? m.path : '', imageUrl: m ? m.url : '' })} />
      {errs.image && <small className="err" role="alert">{errs.image}</small>}
      {msg && <p className="notice bad" role="alert">{msg}</p>}
      <SaveRow busy={busy} row={row} onClose={onClose} onSave={(publish) => save(data, { publish, slug: row?.slug })} />
    </Modal>
  )
}

export function EventsAdmin() {
  return <EntryAdmin kind="event" titleKey="ad.ev.title" descKey="ad.ev.desc" addKey="ad.ev.add" Editor={EventEditor} blank={{}}
    columns={(t) => [
      { id: 'title', label: t('ad.ev.event'), primary: true, cell: (r) => <div className="dt-stack"><strong className="dt-clamp">{r.title}</strong><small className="dt-sub">{r.data.venue || '—'}</small></div> },
      { id: 'date', label: t('ad.ev.date'), width: '170px', cell: (r) => <small className="dt-sub">{r.data.date}{r.data.time ? ` · ${r.data.time}` : ''}</small> },
    ]} />
}

/* ---------------------------------------------------------------- FAQ */

function FAQEditor({ row, onClose, onSaved, kind }) {
  const { t } = useApp()
  const d = row?.data || {}
  const [v, setV] = useState({ qEn: d.qEn || '', qBn: d.qBn || '', aEn: d.aEn || '', aBn: d.aBn || '' })
  const { errs, msg, busy, save } = useEntrySave(kind, row, onSaved)
  return (
    <Modal title={t(row ? 'ad.faq.edit' : 'ad.faq.add')} onClose={onClose} drawer busy={busy}>
      <Field label={t('ad.faq.qEn')} required error={errs.qEn}>{(id, bad) => <input id={id} {...text(v, setV, 'qEn')} aria-invalid={bad} maxLength={300} />}</Field>
      <Field label={t('ad.faq.aEn')} required error={errs.aEn} count={v.aEn.length} max={4000}>{(id, bad) => <textarea id={id} rows={5} {...text(v, setV, 'aEn')} aria-invalid={bad} maxLength={4000} />}</Field>
      <Field label={t('ad.faq.qBn')} error={errs.qBn}>{(id, bad) => <input id={id} lang="bn" {...text(v, setV, 'qBn')} aria-invalid={bad} maxLength={300} />}</Field>
      <Field label={t('ad.faq.aBn')} error={errs.aBn} count={v.aBn.length} max={4000}>{(id, bad) => <textarea id={id} lang="bn" rows={5} {...text(v, setV, 'aBn')} aria-invalid={bad} maxLength={4000} />}</Field>
      {msg && <p className="notice bad" role="alert">{msg}</p>}
      <SaveRow busy={busy} row={row} onClose={onClose} onSave={(publish) => save(v, { publish })} />
    </Modal>
  )
}

export function FAQAdmin() {
  return <EntryAdmin kind="faq" titleKey="ad.faq.title" descKey="ad.faq.desc" addKey="ad.faq.add" Editor={FAQEditor} blank={{}}
    columns={(t) => [
      { id: 'q', label: t('ad.faq.question'), primary: true, cell: (r) => <div className="dt-stack"><strong className="dt-clamp">{r.data.qEn || r.data.qBn}</strong><small className="dt-sub dt-clamp">{r.data.aEn || r.data.aBn}</small></div> },
    ]} />
}

/* ---------------------------------------------------------------- departments and upazilas */

function DepartmentEditor({ row, onClose, onSaved, kind }) {
  const { t } = useApp()
  const [name, setName] = useState(row?.data?.name || '')
  const { errs, msg, busy, save } = useEntrySave(kind, row, onSaved)
  return (
    <Modal title={t(row ? 'ad.dep.edit' : 'ad.dep.add')} onClose={onClose} busy={busy}>
      <Field label={t('ad.dep.name')} required error={errs.name}>{(id, bad) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={bad} maxLength={100} autoFocus />}</Field>
      {msg && <p className="notice bad" role="alert">{msg}</p>}
      <SaveRow busy={busy} row={row} onClose={onClose} onSave={(publish) => save({ name }, { publish })} />
    </Modal>
  )
}

function UpazilaEditor({ row, onClose, onSaved, kind }) {
  const { t } = useApp()
  const d = row?.data || {}
  const [v, setV] = useState({ slug: row?.slug || d.slug || '', nameEn: d.nameEn || '', nameBn: d.nameBn || '', unions: (d.unions || []).join('\n'),
    population: d.population ?? '', areaKm2: d.areaKm2 ?? '', source: d.source || '', unionSource: d.unionSource || '', lastVerified: d.lastVerified || '', note: d.note || '', verified: !!d.verified })
  const { errs, msg, busy, save } = useEntrySave(kind, row, onSaved)
  const data = () => ({ ...d, slug: v.slug.trim(), nameEn: v.nameEn, nameBn: v.nameBn, unions: v.unions.split('\n').map((x) => x.trim()).filter(Boolean),
    population: v.population === '' ? null : Number(v.population), areaKm2: v.areaKm2 === '' ? null : Number(v.areaKm2),
    source: v.source, unionSource: v.unionSource, lastVerified: v.lastVerified, note: v.note, verified: v.verified })
  return (
    <Modal title={t(row ? 'ad.up.edit' : 'ad.up.add')} onClose={onClose} drawer busy={busy}>
      <div className="ad-grid-2">
        <Field label={t('ad.up.nameEn')} required error={errs.nameEn}>{(id, bad) => <input id={id} {...text(v, setV, 'nameEn')} aria-invalid={bad} />}</Field>
        <Field label={t('ad.up.nameBn')} required>{(id) => <input id={id} lang="bn" {...text(v, setV, 'nameBn')} />}</Field>
        <Field label={t('ad.up.slug')} required error={errs.slug} hint={t('ad.up.slugHint')}>{(id, bad) => <input id={id} {...text(v, setV, 'slug')} aria-invalid={bad} disabled={!!row} />}</Field>
        <Field label={t('ad.up.lastVerified')}>{(id) => <input id={id} type="date" {...text(v, setV, 'lastVerified')} />}</Field>
        <Field label={t('ad.up.population')}>{(id) => <input id={id} type="number" min="0" {...text(v, setV, 'population')} />}</Field>
        <Field label={t('ad.up.area')}>{(id) => <input id={id} type="number" min="0" step="0.01" {...text(v, setV, 'areaKm2')} />}</Field>
      </div>
      <Field label={t('ad.up.unions')} error={errs.unions} hint={t('ad.up.unionsHint')}>{(id, bad) => <textarea id={id} rows={8} {...text(v, setV, 'unions')} aria-invalid={bad} />}</Field>
      <Field label={t('ad.up.source')} error={errs.source} hint="https://…">{(id, bad) => <input id={id} type="url" {...text(v, setV, 'source')} aria-invalid={bad} />}</Field>
      <Field label={t('ad.up.note')}>{(id) => <textarea id={id} rows={2} {...text(v, setV, 'note')} />}</Field>
      <label className="check"><input type="checkbox" checked={v.verified} onChange={(e) => setV({ ...v, verified: e.target.checked })} /> {t('ad.up.verified')}</label>
      {msg && <p className="notice bad" role="alert">{msg}</p>}
      <SaveRow busy={busy} row={row} onClose={onClose} onSave={(publish) => save(data(), { publish, slug: v.slug.trim() })} />
    </Modal>
  )
}

export function ReferenceAdmin() {
  const { t, n } = useApp()
  const [tab, setTab] = useState('upazila')
  return (
    <>
      <div className="ad-dir-tabs" role="tablist">
        {[['upazila', 'ad.up.title'], ['department', 'ad.dep.title']].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`ad-view ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{t(label)}</button>
        ))}
      </div>
      {tab === 'upazila'
        ? <EntryAdmin key="u" kind="upazila" titleKey="ad.up.title" descKey="ad.up.desc" addKey="ad.up.add" Editor={UpazilaEditor} blank={{}} search={false}
            columns={(tt) => [
              { id: 'name', label: tt('ad.up.name'), primary: true, cell: (r) => <div className="dt-stack"><strong>{r.data.nameEn}</strong><small className="dt-sub" lang="bn">{r.data.nameBn}</small></div> },
              { id: 'unions', label: tt('ad.up.unions'), width: '140px', cell: (r) => <small className="dt-sub">{n((r.data.unions || []).length)}</small> },
            ]} />
        : <EntryAdmin key="d" kind="department" titleKey="ad.dep.title" descKey="ad.dep.desc" addKey="ad.dep.add" Editor={DepartmentEditor} blank={{}}
            columns={(tt) => [{ id: 'name', label: tt('ad.dep.name'), primary: true, cell: (r) => <strong>{r.data.name}</strong> }]} />}
    </>
  )
}

/* ---------------------------------------------------------------- alumni */

const PRIVATE_FIELDS = [['phone', 'tel'], ['email', 'email'], ['bloodGroup', 'text'], ['permanentAddress', 'text'], ['presentAddress', 'text'], ['facebook', 'url'], ['photoLink', 'url'], ['note', 'text']]

function AlumnusEditor({ row, depts, ups, onClose, onSaved }) {
  const { t, n, pick } = useApp()
  const errText = useErrText()
  const [v, setV] = useState({ name: row?.name || '', batch: row?.batch ? String(row.batch) : '', department: row?.department || '', occupation: row?.occupation || '', workplace: row?.workplace || '',
    designation: row?.designation || '', upazila: row?.upazila || '', private: { ...(row?.private || {}) } })
  const [errs, setErrs] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true); setErrs({}); setMsg('')
    try {
      await api(row ? `/admin/alumni/${row.id}` : '/admin/alumni', { method: row ? 'PATCH' : 'POST', body: JSON.stringify({ ...v, batch: Number(v.batch) || 0 }) })
      onSaved()
    } catch (e) { if (e.fields) setErrs(e.fields); else setMsg(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Modal title={t(row ? 'ad.al.edit' : 'ad.al.add')} onClose={onClose} drawer busy={busy}>
      <Field label={t('ad.al.name')} required error={errs.name}>{(id, bad) => <input id={id} {...text(v, setV, 'name')} aria-invalid={bad} maxLength={200} />}</Field>
      <div className="ad-grid-2">
        <Field label={t('auth.batch')} error={errs.batch}>{(id, bad) => (
          <select id={id} {...text(v, setV, 'batch')} aria-invalid={bad}><option value="">—</option>{Array.from({ length: 30 }, (_, i) => i + 1).map((b) => <option key={b} value={b}>{t('auth.batch')} {n(b)}</option>)}</select>)}</Field>
        <Field label={t('auth.dept')} error={errs.department}>{(id, bad) => (
          <select id={id} {...text(v, setV, 'department')} aria-invalid={bad}><option value="">—</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>)}</Field>
        <Field label={t('ad.al.occupation')} error={errs.occupation}>{(id, bad) => <input id={id} {...text(v, setV, 'occupation')} aria-invalid={bad} />}</Field>
        <Field label={t('ad.al.designation')} error={errs.designation}>{(id, bad) => <input id={id} {...text(v, setV, 'designation')} aria-invalid={bad} />}</Field>
        <Field label={t('ad.al.workplace')} error={errs.workplace}>{(id, bad) => <input id={id} {...text(v, setV, 'workplace')} aria-invalid={bad} />}</Field>
        <Field label={t('auth.upazila')} error={errs.upazila}>{(id, bad) => (
          <select id={id} {...text(v, setV, 'upazila')} aria-invalid={bad}><option value="">—</option>{ups.map((u) => <option key={u.slug} value={u.slug}>{pick(u.nameBn, u.nameEn)}</option>)}</select>)}</Field>
      </div>
      <h4 className="ad-sub-h"><Icon name="shield" size={15} /> {t('ad.al.private')}</h4>
      <p className="muted small">{t('ad.al.privateNote')}</p>
      <div className="ad-grid-2">
        {PRIVATE_FIELDS.map(([k, type]) => (
          <Field key={k} label={t(`ad.al.p.${k}`)} error={errs[k]}>{(id, bad) => (
            <input id={id} type={type} value={v.private[k] || ''} aria-invalid={bad} onChange={(e) => setV({ ...v, private: { ...v.private, [k]: e.target.value } })} />)}</Field>
        ))}
      </div>
      {msg && <p className="notice bad" role="alert">{msg}</p>}
      <div className="row">
        <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={save}>{busy ? t('state.loading') : t('ad.sd.save')}</button>
        <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={onClose}>{t('admin.roles.cancel')}</button>
      </div>
    </Modal>
  )
}

export function AlumniAdmin() {
  const { t, n, pick } = useApp()
  const errText = useErrText()
  const [f, set] = useFilters({ q: '', department: '', batch: '', page: '1', limit: '25' })
  const list = useApi(`/admin/alumni${qs({ ...f, page: f.page === '1' ? '' : f.page })}`)
  const depts = useApi('/departments')
  const ups = useApi('/upazilas')
  const { notice, ok, bad, clear } = useNotice()
  const [edit, setEdit] = useState(null)
  const [drop, setDrop] = useState(null)
  const [busy, setBusy] = useState(false)
  const rows = list.data?.items || []
  const upName = (slug) => { const u = (ups.data?.items || []).find((x) => x.slug === slug); return u ? pick(u.nameBn, u.nameEn) : '' }
  const remove = async () => {
    setBusy(true); clear()
    try { await api(`/admin/alumni/${drop.id}/delete`, { method: 'POST', body: '{}' }); ok(t('ad.al.deleted')); list.retry() }
    catch (e) { bad(errText(e)) } finally { setBusy(false); setDrop(null) }
  }
  return (
    <section>
      <PageHeader title={t('ad.al.title')} desc={t('ad.al.desc')}
        action={<button type="button" className="btn btn-dark" onClick={() => setEdit({})}><Icon name="plus" size={16} /> {t('ad.al.add')}</button>} />
      <ListToolbar section="alumni" values={f} set={set} defaults={{ limit: '25' }} total={list.data?.total} loading={list.loading}
        search={{ placeholder: t('ad.al.search') }}
        fields={[
          { key: 'department', label: t('auth.dept'), all: t('ad.stu.anyDept'), options: (depts.data?.items || []).map((d) => [d, d]) },
          { key: 'batch', label: t('auth.batch'), all: t('ad.stu.anyBatch'), options: Array.from({ length: 30 }, (_, i) => [String(i + 1), `${t('auth.batch')} ${n(i + 1)}`]) },
        ]} />
      <Notice notice={notice} onClose={clear} />
      {list.loading && <SkeletonRows />}
      {list.error && <Data q={list}>{() => null}</Data>}
      {list.data && (rows.length === 0 ? <EmptyState title={t('ad.sd.none')} text={t('ad.sd.noneHint')} /> : (
        <>
          <DataTable caption={t('ad.al.title')} rows={rows} rowKey={(r) => r.id}
            columns={[
              { id: 'name', label: t('ad.al.name'), primary: true, cell: (r) => <div className="dt-stack"><strong className="dt-clamp">{r.name}</strong><small className="dt-sub dt-trunc">{[r.designation, r.occupation].filter(Boolean).join(' · ') || '—'}</small></div> },
              { id: 'work', label: t('ad.al.workplace'), width: '24%', cell: (r) => <small className="dt-sub dt-clamp">{r.workplace || '—'}</small> },
              { id: 'acad', label: t('ad.stu.col.academic'), width: '20%', cell: (r) => <div className="dt-stack"><small className="dt-sub dt-trunc">{r.department || '—'}</small><small className="dt-sub">{r.batch ? `${t('auth.batch')} ${n(r.batch)}` : ''} {upName(r.upazila)}</small></div> },
              { id: 'contact', label: t('ad.al.private'), width: '20%', cell: (r) => <div className="dt-stack"><small className="dt-sub dt-trunc">{r.private.phone || '—'}</small><small className="dt-sub dt-trunc">{r.private.email || ''}</small></div> },
              { id: 'actions', srLabel: t('ad.actions'), width: '120px', className: 'dt-actions-cell', cell: (r) => (
                <div className="dt-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(r)}>{t('ad.edit')}</button>
                  <RowMenu label={`${t('ad.actions')}: ${r.name}`} items={[{ label: t('ad.al.delete'), icon: 'trash', danger: true, onClick: () => setDrop(r) }]} />
                </div>
              ) },
            ]} />
          <Pager total={list.data.total} page={list.data.page} pages={list.data.pages} limit={f.limit} onPage={(p) => set({ page: p })} onLimit={(limit) => set({ limit })} />
        </>
      ))}
      {edit && <AlumnusEditor row={edit.id ? edit : null} depts={depts.data?.items || []} ups={ups.data?.items || []} onClose={() => setEdit(null)}
        onSaved={() => { const isNew = !edit.id; setEdit(null); ok(t(isNew ? 'ad.al.created' : 'ad.al.saved')); list.retry() }} />}
      {drop && <Confirm tone="danger" title={t('ad.al.delete')} text={t('ad.al.deleteText').replace('{who}', drop.name)} label={t('ad.al.delete')} busy={busy} onYes={remove} onNo={() => setDrop(null)} />}
    </section>
  )
}
