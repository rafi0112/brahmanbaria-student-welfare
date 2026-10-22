import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, downloadFile, qs, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { Avatar, Badge, Data } from '../components/ui.jsx'
import { Confirm, EmptyState, Field, Modal, Notice, PageHeader, Pager, RowMenu, SearchBox, Select, SkeletonRows, StatusBadge, useErrText, useFilters, useNotice, useWhen } from './kit.jsx'
import Icon from './icons.jsx'
import ListToolbar from './toolbar.jsx'
import DataTable, { Trunc } from './DataTable.jsx'

const BATCHES = Array.from({ length: 25 }, (_, i) => 25 - i)

export default function StudentsAdmin() {
  const { t } = useApp()
  const [sp, setSp] = useSearchParams()
  const f = { tab: sp.get('tab') === 'imported' ? 'imported' : 'members' }
  const switchTab = (k) => setSp(k === 'members' ? {} : { tab: k }) // each tab starts with clean filters
  return (
    <section aria-labelledby="stu-h">
      <PageHeader title={<span id="stu-h">{t('ad.stu.title')}</span>} desc={t('ad.stu.desc')} />
      <div className="chips" role="tablist" aria-label={t('ad.stu.title')}>
        {['members', 'imported'].map((k) => (
          <button key={k} role="tab" aria-selected={f.tab === k} className={`chip ${f.tab === k ? 'on' : ''}`} onClick={() => switchTab(k)}>{t(`ad.stu.tab.${k}`)}</button>
        ))}
      </div>
      {f.tab === 'imported' ? <Imported /> : <Members />}
    </section>
  )
}

/* ---------------------------------------------------------------- registered members */

function Members() {
  const { t, n, lang, pick } = useApp()
  const { user: me } = useAuth()
  const errText = useErrText()
  const when = useWhen(lang)
  const [f, set] = useFilters({ q: '', status: '', department: '', batch: '', verified: '', complete: '', disabled: '', sort: 'newest', page: '1', limit: '20' })
  const depts = useApi('/departments')
  const list = useApi(`/admin/students${qs({ ...f, page: f.page === '1' ? '' : f.page })}`)
  const { notice, ok, bad, clear } = useNotice()
  const [picked, setPicked] = useState([])
  const [edit, setEdit] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const rows = list.data?.items || []
  useEffect(() => setPicked([]), [f.q, f.status, f.department, f.batch, f.verified, f.complete, f.disabled, f.sort, f.page, f.limit])

  const act = async (path, body, doneText, opts = {}) => {
    setBusy(true); clear()
    try {
      const r = await api(path, { method: opts.method || 'POST', body: body ? JSON.stringify(body) : undefined })
      ok(typeof doneText === 'function' ? doneText(r) : doneText)
      list.retry()
      return r
    } catch (e) { bad(errText(e)) } finally { setBusy(false); setConfirm(null) }
    return undefined
  }
  const bulk = (action) => setConfirm({
    text: t('ad.stu.confirmBulk').replace('{n}', n(picked.length)).replace('{action}', t(`ad.stu.act.${action}`).toLowerCase()), label: t(`ad.stu.act.${action}`),
    run: () => act('/admin/students/bulk', { ids: picked, action }, (r) => `${t('ad.stu.bulkDone').replace('{n}', n(r.done))}${r.failed?.length ? ` ${t('ad.stu.bulkFailed').replace('{n}', n(r.failed.length))}` : ''}`).then((r) => r && setPicked(r.failed?.map((x) => x.id) || [])),
  })
  const exportCsv = (contact) => {
    const run = async () => {
      setBusy(true); clear()
      try {
        await downloadFile(`/admin/export/students${qs({ ...f, page: '', limit: '', contact: contact ? '1' : '' })}`, 'members.csv')
        ok(t('ad.stu.exported'))
      } catch (e) { bad(errText(e)) } finally { setBusy(false); setConfirm(null) }
    }
    if (contact) setConfirm({ text: t('ad.stu.confirmContact'), label: t('ad.stu.exportContact'), run })
    else run()
  }
  const allOnPage = rows.length > 0 && rows.every((r) => picked.includes(r.id))
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const filtered = Object.entries(f).some(([k, v]) => v && !['page', 'limit'].includes(k))
  const clearAll = () => set({ q: '', status: '', department: '', batch: '', verified: '', complete: '', disabled: '' })

  return (
    <>
      <ListToolbar section="students" values={f} set={set} defaults={{ sort: 'newest', limit: '20' }} total={list.data?.total} loading={list.loading}
        search={{ placeholder: t('ad.stu.search') }}
        views={[
          { id: 'all', label: t('ad.stu.view.all'), patch: { status: '', complete: '' } }, { id: 'pending', label: t('ad.status.pending'), patch: { status: 'pending' } },
          { id: 'approved', label: t('ad.status.approved'), patch: { status: 'approved' } }, { id: 'rejected', label: t('ad.status.rejected'), patch: { status: 'rejected' } },
          { id: 'incomplete', label: t('ad.stu.view.incomplete'), patch: { complete: 'no' } },
        ]}
        fields={[
          { key: 'department', label: t('auth.dept'), all: t('ad.stu.anyDept'), options: (depts.data?.items || []).map((d) => [d, d]) },
          { key: 'batch', label: t('auth.batch'), all: t('ad.stu.anyBatch'), options: BATCHES.map((bt) => [String(bt), `${t('auth.batch')} ${n(bt)}`]) },
          { key: 'verified', label: t('ad.stu.verified'), all: t('ad.stu.anyVerified'), advanced: true, options: [['yes', t('ad.stu.verifiedYes')], ['no', t('ad.stu.verifiedNo')]] },
          { key: 'complete', label: t('ad.stu.complete'), all: t('ad.stu.anyComplete'), advanced: true, options: [['yes', t('ad.stu.completeYes')], ['no', t('ad.stu.completeNo')]] },
          { key: 'disabled', label: t('ad.stu.account'), all: t('ad.stu.anyAccount'), advanced: true, options: [['no', t('ad.stu.active')], ['yes', t('ad.stu.deactivated')]] },
        ]}
        sorts={[['newest', t('ad.stu.sort.newest')], ['oldest', t('ad.stu.sort.oldest')], ['name', t('ad.stu.sort.name')], ['batch', t('ad.stu.sort.batch')], ['status', t('ad.stu.sort.status')]]}
        extra={(
          <>
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => exportCsv(false)}><Icon name="download" size={16} /> {t('ad.stu.export')}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => exportCsv(true)}>{t('ad.stu.exportContact')}</button>
          </>
        )} />
      <Notice notice={notice} onClose={clear} />

      {picked.length > 0 && (
        <div className="ad-bulk" role="region" aria-label={t('ad.bulk')}>
          <strong>{n(picked.length)} {t('ad.selected')}</strong>
          <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => bulk('approve')}>{t('ad.stu.act.approve')}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => bulk('reject')}>{t('ad.stu.act.reject')}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => bulk('reset')}>{t('ad.stu.act.reset')}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked([])}>{t('ad.clearSel')}</button>
        </div>
      )}

      {list.loading && <SkeletonRows />}
      {list.error && <Data q={list}>{() => null}</Data>}
      {list.data && (rows.length === 0 ? (
        <EmptyState title={t(filtered ? 'ad.stu.noMatch' : 'ad.stu.none')} text={t(filtered ? 'ad.stu.noMatchHint' : 'ad.stu.noneHint')}
          action={filtered && <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>{t('common.clear')}</button>} />
      ) : (
        <>
          <DataTable caption={t('ad.stu.title')} rows={rows} rowKey={(r) => r.id} rowClass={(r) => (r.disabled ? 'is-off' : '')}
            selection={{ picked, toggle, allOn: allOnPage, toggleAll: () => setPicked(allOnPage ? [] : rows.map((r) => r.id)), name: (r) => r.name }}
            columns={[
              { id: 'member', label: t('ad.stu.col.member'), primary: true, cell: (r) => (
                <span className="dt-person"><Avatar name={r.name} size={34} /><span className="dt-twoline"><strong className="dt-clamp">{r.name}{r.status === 'approved' && r.emailVerified && <VerifiedMark label={t('ad.vm.member')} />}</strong><small className="dt-sub dt-trunc" title={r.email}>{r.email}</small></span></span>
              ) },
              { id: 'academic', label: t('ad.stu.col.academic'), width: '24%', cell: (r) => <div className="dt-stack"><span className="dt-trunc" title={r.department}>{r.department}</span><small className="dt-sub">{t('auth.batch')} {n(r.batch)}</small></div> },
              { id: 'status', label: t('ad.stu.col.status'), width: '30%', cell: (r) => (
                <div className="dt-stack">
                  <span className="dt-badges"><StatusBadge status={r.status} />{r.role === 'admin' && <span className="st st-role">{t('admin.roles.admin')}</span>}</span>
                  <small className={`dt-sub ${r.emailVerified ? '' : 'is-warn'}`}>{r.emailVerified ? t('admin.roles.verified') : t('admin.roles.unverified')} · {r.disabled ? t('ad.stu.deactivated') : t('ad.stu.active')} · {r.complete ? t('ad.stu.completeYes') : t('ad.stu.completeNo')}</small>
                  <small className="dt-sub">{when(r.createdAt)}</small>
                </div>
              ) },
              { id: 'actions', srLabel: t('ad.actions'), width: '150px', className: 'dt-actions-cell', cell: (r) => (
                <div className="dt-actions">
                  {r.status === 'pending' && <button type="button" className="btn btn-ok btn-sm" disabled={busy} onClick={() => act(`/admin/students/${r.id}/approve`, null, t('ad.stu.approved'))}>{t('ad.stu.act.approve')}</button>}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(r)}>{t('ad.view')}</button>
                </div>
              ) },
            ]} />
          <Pager total={list.data.total} page={list.data.page} pages={list.data.pages} limit={f.limit} onPage={(p) => set({ page: p })} onLimit={(limit) => set({ limit })} />
        </>
      ))}

      {edit && <MemberModal row={edit} me={me} depts={depts.data?.items || []} pick={pick}
        onClose={() => setEdit(null)} onSaved={(r, text) => { setEdit(r); ok(text); list.retry() }} />}
      {confirm && <Confirm text={confirm.text} label={confirm.label} busy={busy} onYes={confirm.run} onNo={() => setConfirm(null)} />}
    </>
  )
}

function MemberModal({ row, me, depts, pick, onClose, onSaved }) {
  const { t, n } = useApp()
  const errText = useErrText()
  const ups = useApi('/upazilas')
  const [v, setV] = useState({ name: row.name, batch: String(row.batch), department: row.department, upazila: row.upazila, union: row.union, phone: row.phone, bloodGroup: row.bloodGroup, showInDirectory: row.showInDirectory })
  const [errs, setErrs] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [confirm, setConfirm] = useState(null)
  useEffect(() => setV({ name: row.name, batch: String(row.batch), department: row.department, upazila: row.upazila, union: row.union, phone: row.phone, bloodGroup: row.bloodGroup, showInDirectory: row.showInDirectory }), [row])
  const unions = useMemo(() => (ups.data?.items || []).find((u) => u.slug === v.upazila)?.unions || [], [ups.data, v.upazila])
  const dirty = v.name !== row.name || v.batch !== String(row.batch) || v.department !== row.department || v.upazila !== row.upazila || v.union !== row.union || v.phone !== row.phone || v.bloodGroup !== row.bloodGroup || v.showInDirectory !== row.showInDirectory
  const self = row.id === me?.id

  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setErrs({}); setMsg(null)
    try {
      const r = await api(`/admin/students/${row.id}`, { method: 'PATCH', body: JSON.stringify({ ...v, batch: Number(v.batch) }) })
      onSaved(r, t('ad.saved'))
    } catch (err) {
      if (err.fields) setErrs(err.fields)
      setMsg(errText(err))
    } finally { setBusy(false) }
  }
  const action = async (name, done) => {
    setBusy(true); setMsg(null)
    try { onSaved(await api(`/admin/students/${row.id}/${name}`, { method: 'POST' }), done) } catch (err) { setMsg(errText(err)) } finally { setBusy(false); setConfirm(null) }
  }
  const text = (k) => (e) => setV({ ...v, [k]: e.target.value })

  return (
    <Modal title={row.name} onClose={onClose} drawer busy={busy} guard={() => dirty && !window.confirm(t('ad.leaveConfirm'))}>
      <p className="muted small">{row.email} · <StatusBadge status={row.status} /> · {row.role === 'admin' ? t('admin.roles.admin') : t('admin.roles.member')}
        {row.role === 'admin' && <> — <Link to="/admin?tab=roles">{t('ad.stu.manageRole')}</Link></>}</p>
      <form onSubmit={save} noValidate className="ad-form">
        <div className="ad-grid">
          <Field label={t('auth.name')} required error={errs.name} max={80} count={v.name.length}>{(id, bad) => <input id={id} value={v.name} onChange={text('name')} maxLength={80} aria-invalid={bad} />}</Field>
          <Field label={t('auth.batch')} required error={errs.batch}>{(id, bad) => (
            <select id={id} value={v.batch} onChange={text('batch')} aria-invalid={bad}>{BATCHES.map((b) => <option key={b} value={b}>{t('auth.batch')} {n(b)}</option>)}</select>)}</Field>
          <Field label={t('auth.dept')} required error={errs.department}>{(id, bad) => (
            <select id={id} value={v.department} onChange={text('department')} aria-invalid={bad}>{depts.map((d) => <option key={d} value={d}>{d}</option>)}</select>)}</Field>
          <Field label={t('auth.upazila')} required error={errs.upazila}>{(id, bad) => (
            <select id={id} value={v.upazila} onChange={(e) => setV({ ...v, upazila: e.target.value, union: '' })} aria-invalid={bad}>
              {(ups.data?.items || []).map((u) => <option key={u.slug} value={u.slug}>{pick(u.nameBn, u.nameEn)}</option>)}</select>)}</Field>
          <Field label={t('auth.union')} required error={errs.union}>{(id, bad) => (
            <select id={id} value={v.union} onChange={text('union')} aria-invalid={bad}><option value="">{t('auth.select')}</option>{unions.map((u) => <option key={u} value={u}>{u}</option>)}</select>)}</Field>
          <Field label={t('ad.stu.phone')} error={errs.phone} hint="01XXXXXXXXX">{(id, bad) => <input id={id} value={v.phone} onChange={text('phone')} inputMode="tel" maxLength={11} aria-invalid={bad} />}</Field>
          <Field label={t('ad.stu.blood')} error={errs.bloodGroup}>{(id, bad) => (
            <select id={id} value={v.bloodGroup} onChange={text('bloodGroup')} aria-invalid={bad}><option value="">—</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}</select>)}</Field>
        </div>
        <label className="check"><input type="checkbox" checked={v.showInDirectory} onChange={(e) => setV({ ...v, showInDirectory: e.target.checked })} /> {t('dash.listed')}</label>
        <p className="muted small">{t('ad.stu.roleNote')}</p>
        {msg && <p className="notice bad" role="alert">{msg}</p>}
        <div className="row">
          <button className="btn btn-dark btn-sm" disabled={busy || !dirty}>{busy ? t('state.loading') : t('cm.save')}</button>
          <Link className="btn btn-ghost btn-sm" to={`/admin/profile/m-${row.id}`}>{t('ad.stu.profilePage')}</Link>
        </div>
      </form>
      <hr />
      <h4>{t('ad.stu.membership')}</h4>
      <div className="row">
        {row.status !== 'approved' && <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => action('approve', t('ad.stu.approved'))}>{t('ad.stu.act.approve')}</button>}
        {row.status !== 'rejected' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => action('reject', t('ad.stu.rejected'))}>{t('ad.stu.act.reject')}</button>}
        {row.status !== 'pending' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => action('reset', t('ad.stu.reset'))}>{t('ad.stu.act.reset')}</button>}
      </div>
      <h4>{t('ad.stu.account')}</h4>
      <p className="muted small">{row.disabled ? t('ad.stu.deactivatedNote') : t('ad.stu.deactivateNote')}</p>
      <div className="row">
        {row.disabled
          ? <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => action('activate', t('ad.stu.activated'))}>{t('ad.stu.act.activate')}</button>
          : <button type="button" className="btn btn-ghost btn-sm" disabled={busy || self || row.role === 'admin'} title={self || row.role === 'admin' ? t('ad.stu.cannotDeactivate') : undefined}
            onClick={() => setConfirm({ text: t('ad.stu.confirmDeactivate').replace('{who}', row.name), label: t('ad.stu.act.deactivate') })}>{t('ad.stu.act.deactivate')}</button>}
      </div>
      {confirm && <Confirm tone="danger" text={confirm.text} label={confirm.label} busy={busy} onYes={() => action('deactivate', t('ad.stu.deactivatedDone'))} onNo={() => setConfirm(null)} />}
    </Modal>
  )
}

/* ---------------------------------------------------------------- imported directory */

// Small check beside a name. It is only drawn when the real condition holds, and always carries a written explanation.
function VerifiedMark({ label }) {
  return <span className="vmark" title={label} role="img" aria-label={label}><Icon name="verified" size={15} /></span>
}

function Imported() {
  const { t, n, lang } = useApp()
  const errText = useErrText()
  const when = useWhen(lang)
  const [f, set] = useFilters({ q: '', department: '', batch: '', status: '', page: '1', limit: '20' })
  const depts = useApi('/departments')
  const list = useApi(`/admin/imported-students${qs({ ...f, page: f.page === '1' ? '' : f.page })}`)
  const { notice, ok, bad, clear } = useNotice()
  const [verify, setVerify] = useState(null)
  const [undo, setUndo] = useState(null)
  const [form, setForm] = useState(null) // null | {} (new) | a manual record (edit)
  const [drop, setDrop] = useState(null)
  const [busy, setBusy] = useState(false)
  const rows = list.data?.items || []
  const counts = list.data?.counts || {}
  const filtered = !!(f.q || f.department || f.batch || f.status)
  const unverify = async () => {
    setBusy(true); clear()
    try { await api(`/admin/imported-students/${undo.id}/unverify`, { method: 'POST', body: '{}' }); ok(t('ad.imp.undone')); list.retry() } catch (e) { bad(errText(e)) } finally { setBusy(false); setUndo(null) }
  }
  const remove = async () => {
    setBusy(true); clear()
    try { await api(`/admin/imported-students/${drop.id}/delete`, { method: 'POST', body: '{}' }); ok(t('ad.imp.deleted')); list.retry() } catch (e) { bad(errText(e)) } finally { setBusy(false); setDrop(null) }
  }
  return (
    <>
      <div className="ad-subhead"><p className="notice">{t('ad.imp.note')}{list.data?.sample ? ` ${t('students.sample')}` : ''}</p>
        <button type="button" className="btn btn-dark btn-sm" onClick={() => setForm({})}><Icon name="plus" size={15} /> {t('ad.imp.add')}</button></div>
      <ListToolbar section="imported" values={f} set={set} defaults={{ limit: '20' }} total={list.data?.total} loading={list.loading}
        search={{ placeholder: t('ad.stu.searchName') }}
        views={[
          { id: 'all', label: t('ad.status.allShort'), patch: { status: '' } },
          { id: 'awaiting', label: `${t('ad.imp.awaiting')}${counts.awaiting != null ? ` ${n(counts.awaiting)}` : ''}`, patch: { status: 'awaiting' } },
          { id: 'verified', label: `${t('ad.imp.verified')}${counts.verified != null ? ` ${n(counts.verified)}` : ''}`, patch: { status: 'verified' } },
        ]}
        fields={[
          { key: 'department', label: t('auth.dept'), all: t('ad.stu.anyDept'), options: (depts.data?.items || []).map((d) => [d, d]) },
          { key: 'batch', label: t('auth.batch'), all: t('ad.stu.anyBatch'), options: BATCHES.map((bt) => [String(bt), `${t('auth.batch')} ${n(bt)}`]) },
        ]} />
      <Notice notice={notice} onClose={clear} />
      {list.loading && <SkeletonRows />}
      {list.error && <Data q={list}>{() => null}</Data>}
      {list.data && (rows.length === 0 ? <EmptyState title={t(filtered ? 'ad.stu.noMatch' : 'ad.imp.none')} text={t('ad.stu.noMatchHint')} /> : (
        <>
          <DataTable caption={t('ad.stu.tab.imported')} rows={rows} rowKey={(r) => r.id}
            columns={[
              { id: 'member', label: t('ad.stu.col.member'), primary: true, cell: (r) => (
                <Link to={`/admin/profile/${r.id}`} className="dt-person"><Avatar name={r.name} size={30} /><span className="dt-twoline"><strong className="dt-clamp">{r.name}{r.verified && <VerifiedMark label={t('ad.vm.imported')} />}</strong><small className="dt-sub dt-trunc">{t(r.source === 'manual' ? 'ad.imp.manual' : 'ad.imp.file')}{r.phone ? ` · ${r.phone}` : ''}</small></span></Link>
              ) },
              { id: 'dept', label: t('students.dept'), width: '26%', cell: (r) => <Trunc>{r.department || '—'}</Trunc> },
              { id: 'batch', label: t('students.batch'), width: '80px', cell: (r) => (r.batch ? n(r.batch) : '—') },
              { id: 'review', label: t('ad.imp.review'), width: '24%', cell: (r) => (
                r.verified ? (
                  <div className="dt-stack"><span className="st st-approved"><span className="st-dot" aria-hidden="true" />{t('ad.imp.verified')}</span>
                    <small className="dt-sub">{r.verifiedBy} · {when(r.verifiedAt)}</small>
                    {r.linked && <small className="dt-sub" title={r.linked.email}>{t('ad.imp.linkedTo')} {r.linked.name}</small>}</div>
                ) : <span className="st st-pending"><span className="st-dot" aria-hidden="true" />{t('ad.imp.awaiting')}</span>
              ) },
              { id: 'actions', srLabel: t('ad.actions'), width: '150px', className: 'dt-actions-cell', cell: (r) => (
                <div className="dt-actions">
                  {!r.verified && <button type="button" className="btn btn-outline btn-sm" onClick={() => setVerify(r)}>{t('ad.imp.verify')}</button>}
                  <RowMenu label={`${t('ad.actions')}: ${r.name}`} items={[
                    r.verified && { label: t('ad.imp.relink'), icon: 'folderMove', onClick: () => setVerify(r) },
                    r.verified && { label: t('ad.imp.unverify'), icon: 'x', onClick: () => setUndo(r) },
                    r.source === 'manual' && { label: t('ad.imp.edit'), icon: 'pencil', sep: !!r.verified, onClick: () => setForm(r) },
                    r.source === 'manual' && { label: t('ad.imp.delete'), icon: 'trash', danger: true, onClick: () => setDrop(r) },
                  ]} />
                </div>
              ) },
            ]} />
          <Pager total={list.data.total} page={list.data.page} pages={list.data.pages} limit={f.limit} onPage={(p) => set({ page: p })} onLimit={(limit) => set({ limit })} />
        </>
      ))}
      {form && <ImportedForm row={form.id ? form : null} depts={depts.data?.items || []} onClose={() => setForm(null)} onSaved={() => { const edit = !!form.id; setForm(null); ok(t(edit ? 'ad.imp.saved' : 'ad.imp.created')); list.retry() }} />}
      {drop && <Confirm tone="danger" text={t('ad.imp.deleteText').replace('{who}', drop.name)} label={t('ad.imp.delete')} busy={busy} onYes={remove} onNo={() => setDrop(null)} />}
      {verify && <VerifyDialog row={verify} onClose={() => setVerify(null)} onDone={() => { setVerify(null); ok(t('ad.imp.done')); list.retry() }} />}
      {undo && <Confirm tone="danger" text={t('ad.imp.unverifyText').replace('{who}', undo.name)} label={t('ad.imp.unverify')} busy={busy} onYes={unverify} onNo={() => setUndo(null)} />}
    </>
  )
}

// Verify an imported record. Optionally link it to the registered account of the same person. Neither choice changes that account.
function VerifyDialog({ row, onClose, onDone }) {
  const { t } = useApp()
  const errText = useErrText()
  const matches = useApi(`/admin/imported-students/${row.id}/matches`)
  const [link, setLink] = useState(row.linked?.id || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    setBusy(true); setErr('')
    try { await api(`/admin/imported-students/${row.id}/verify`, { method: 'POST', body: JSON.stringify({ linkedUserId: link }) }); onDone() } catch (e) { setErr(e.message === 'already_linked' ? t('ad.imp.alreadyLinked') : errText(e)) } finally { setBusy(false) }
  }
  const items = matches.data?.items || []
  return (
    <Modal title={t('ad.imp.verifyTitle')} onClose={onClose} busy={busy}>
      <p><strong>{row.name}</strong> <span className="muted">· {row.department} · {t('auth.batch')} {row.batch}</span></p>
      <p className="muted small">{t('ad.imp.verifyHelp')}</p>
      <fieldset className="ad-matches"><legend>{t('ad.imp.matchTitle')}</legend>
        <label className="check"><input type="radio" name="match" checked={link === ''} onChange={() => setLink('')} /> {t('ad.imp.noLink')}</label>
        {matches.loading && <small className="muted">{t('state.loading')}</small>}
        {items.length === 0 && !matches.loading && <small className="muted">{t('ad.imp.noMatches')}</small>}
        {items.map((m) => (
          <label className="check" key={m.id}><input type="radio" name="match" checked={link === m.id} onChange={() => setLink(m.id)} />
            <span>{m.name} <small className="muted">{m.email} · {m.department} · {t('auth.batch')} {m.batch}{m.sameBatch && m.sameDepartment ? ` · ${t('ad.imp.strong')}` : ''}</small></span></label>
        ))}
      </fieldset>
      {link && <p className="notice">{t('ad.imp.linkNote')}</p>}
      {err && <p className="notice bad" role="alert">{err}</p>}
      <div className="row">
        <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={go}>{busy ? t('state.loading') : t('ad.imp.confirm')}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose}>{t('admin.roles.cancel')}</button>
      </div>
    </Modal>
  )
}

// Add or edit a hand-added directory record. This never creates an account or confirms an email address.
function ImportedForm({ row, depts, onClose, onSaved }) {
  const { t, n } = useApp()
  const errText = useErrText()
  const ups = useApi('/upazilas')
  const start = { name: row?.name || '', batch: row?.batch ? String(row.batch) : '', department: row?.department || '', session: row?.session || '', upazila: row?.upazila || '', phone: row?.phone || '', note: row?.note || '' }
  const [v, setV] = useState(start)
  const [errs, setErrs] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(v) !== JSON.stringify(start)
  const text = (k) => (e) => setV({ ...v, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErrs({}); setMsg('')
    try {
      await api(row ? `/admin/imported-students/${row.id}` : '/admin/imported-students', { method: row ? 'PATCH' : 'POST', body: JSON.stringify({ ...v, batch: Number(v.batch) || 0 }) })
      onSaved()
    } catch (err) {
      if (err.fields) setErrs(err.fields)
      setMsg(errText(err))
    } finally { setBusy(false) }
  }
  return (
    <Modal title={t(row ? 'ad.imp.editTitle' : 'ad.imp.addTitle')} onClose={onClose} drawer busy={busy} guard={() => dirty && !window.confirm(t('ad.leaveConfirm'))}>
      <p className="muted small">{t('ad.imp.formHelp')}</p>
      <form onSubmit={save} noValidate className="ad-form">
        <div className="ad-grid">
          <Field label={t('auth.name')} required error={errs.name} max={80} count={v.name.length}>{(id, bad) => <input id={id} value={v.name} onChange={text('name')} maxLength={80} aria-invalid={bad} />}</Field>
          <Field label={t('auth.batch')} required error={errs.batch}>{(id, bad) => (
            <select id={id} value={v.batch} onChange={text('batch')} aria-invalid={bad}><option value="">{t('auth.select')}</option>{BATCHES.map((b) => <option key={b} value={b}>{t('auth.batch')} {n(b)}</option>)}</select>)}</Field>
          <Field label={t('auth.dept')} required error={errs.department}>{(id, bad) => (
            <select id={id} value={v.department} onChange={text('department')} aria-invalid={bad}><option value="">{t('auth.select')}</option>{depts.map((d) => <option key={d} value={d}>{d}</option>)}</select>)}</Field>
          <Field label={t('students.session')} error={errs.session} hint="2026-27">{(id, bad) => <input id={id} value={v.session} onChange={text('session')} maxLength={7} aria-invalid={bad} />}</Field>
          <Field label={t('auth.upazila')} error={errs.upazila}>{(id, bad) => (
            <select id={id} value={v.upazila} onChange={text('upazila')} aria-invalid={bad}><option value="">—</option>{(ups.data?.items || []).map((u) => <option key={u.slug} value={u.slug}>{u.nameEn}</option>)}</select>)}</Field>
          <Field label={t('ad.stu.phone')} error={errs.phone} hint="01XXXXXXXXX">{(id, bad) => <input id={id} value={v.phone} onChange={text('phone')} inputMode="tel" maxLength={11} aria-invalid={bad} />}</Field>
        </div>
        <Field label={t('ad.imp.noteLabel')} error={errs.note} max={300} count={v.note.length}>{(id, bad) => <textarea id={id} rows={3} value={v.note} onChange={text('note')} maxLength={300} aria-invalid={bad} />}</Field>
        {msg && <p className="notice bad" role="alert">{msg}</p>}
        <div className="row">
          <button className="btn btn-dark btn-sm" disabled={busy || !dirty}>{busy ? t('state.loading') : t('ad.save')}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose}>{t('admin.roles.cancel')}</button>
        </div>
      </form>
    </Modal>
  )
}
