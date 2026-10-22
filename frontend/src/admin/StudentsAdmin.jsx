import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, downloadFile, qs, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { Avatar, Badge, Data } from '../components/ui.jsx'
import { Confirm, EmptyState, Field, Modal, Notice, PageHeader, Pager, SearchBox, Select, SkeletonRows, StatusBadge, useErrText, useFilters, useNotice, useWhen } from './kit.jsx'

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
  const [f, set] = useFilters({ q: '', status: '', department: '', batch: '', verified: '', complete: '', disabled: '', page: '1', limit: '20' })
  const depts = useApi('/departments')
  const list = useApi(`/admin/students${qs({ ...f, page: f.page === '1' ? '' : f.page })}`)
  const { notice, ok, bad, clear } = useNotice()
  const [picked, setPicked] = useState([])
  const [edit, setEdit] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const rows = list.data?.items || []
  useEffect(() => setPicked([]), [f.q, f.status, f.department, f.batch, f.verified, f.complete, f.disabled, f.page, f.limit])

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
      <div className="ad-filters">
        <SearchBox value={f.q} onChange={(q) => set({ q })} placeholder={t('ad.stu.search')} />
        <Select value={f.status} onChange={(status) => set({ status })} label={t('ad.stu.status')} all={t('ad.stu.anyStatus')}
          options={[['pending', t('ad.status.pending')], ['approved', t('ad.status.approved')], ['rejected', t('ad.status.rejected')]]} />
        <Select value={f.department} onChange={(department) => set({ department })} label={t('auth.dept')} all={t('ad.stu.anyDept')} options={(depts.data?.items || []).map((d) => [d, d])} />
        <Select value={f.batch} onChange={(batch) => set({ batch })} label={t('auth.batch')} all={t('ad.stu.anyBatch')} options={BATCHES.map((b) => [String(b), `${t('auth.batch')} ${n(b)}`])} />
        <Select value={f.verified} onChange={(verified) => set({ verified })} label={t('ad.stu.verified')} all={t('ad.stu.anyVerified')} options={[['yes', t('ad.stu.verifiedYes')], ['no', t('ad.stu.verifiedNo')]]} />
        <Select value={f.complete} onChange={(complete) => set({ complete })} label={t('ad.stu.complete')} all={t('ad.stu.anyComplete')} options={[['yes', t('ad.stu.completeYes')], ['no', t('ad.stu.completeNo')]]} />
        <Select value={f.disabled} onChange={(disabled) => set({ disabled })} label={t('ad.stu.account')} all={t('ad.stu.anyAccount')} options={[['no', t('ad.stu.active')], ['yes', t('ad.stu.deactivated')]]} />
        {filtered && <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>{t('common.clear')}</button>}
      </div>
      <div className="row ad-toolbar">
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => exportCsv(false)}>{t('ad.stu.export')}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => exportCsv(true)}>{t('ad.stu.exportContact')}</button>
      </div>
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
          <table className="table rtable">
            <thead>
              <tr>
                <th scope="col"><input type="checkbox" checked={allOnPage} onChange={() => setPicked(allOnPage ? [] : rows.map((r) => r.id))} aria-label={t('ad.selectAll')} /></th>
                <th scope="col">{t('ad.stu.col.member')}</th><th scope="col">{t('ad.stu.col.academic')}</th><th scope="col">{t('ad.stu.col.status')}</th>
                <th scope="col">{t('ad.stu.col.account')}</th><th scope="col">{t('ad.stu.col.joined')}</th><th scope="col"><span className="sr-only">{t('ad.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.disabled ? 'ad-off' : ''}>
                  <td data-label=""><input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`${t('ad.select')} ${r.name}`} /></td>
                  <td data-label={t('ad.stu.col.member')}>
                    <span className="ad-person"><Avatar name={r.name} size={36} /><span><strong>{r.name}</strong><br /><small className="muted">{r.email}</small></span></span>
                  </td>
                  <td data-label={t('ad.stu.col.academic')}>{r.department}<br /><small className="muted">{t('auth.batch')} {n(r.batch)}</small></td>
                  <td data-label={t('ad.stu.col.status')}><StatusBadge status={r.status} />{r.role === 'admin' && <> <Badge tone="gold">{t('admin.roles.admin')}</Badge></>}</td>
                  <td data-label={t('ad.stu.col.account')}>
                    <span className={`verify ${r.emailVerified ? 'yes' : 'no'}`}>{r.emailVerified ? '✓ ' + t('admin.roles.verified') : '! ' + t('admin.roles.unverified')}</span><br />
                    <small className="muted">{r.disabled ? t('ad.stu.deactivated') : t('ad.stu.active')} · {r.complete ? t('ad.stu.completeYes') : t('ad.stu.completeNo')}</small>
                  </td>
                  <td data-label={t('ad.stu.col.joined')}><small>{when(r.createdAt)}</small></td>
                  <td className="actions" data-label="">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(r)}>{t('ad.view')}</button>
                    {r.status === 'pending' && <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => act(`/admin/students/${r.id}/approve`, null, t('ad.stu.approved'))}>{t('ad.stu.act.approve')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    <Modal title={row.name} onClose={onClose} wide busy={busy}>
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

/* ---------------------------------------------------------------- imported directory (read-only) */

function Imported() {
  const { t, n } = useApp()
  const [f, set] = useFilters({ q: '', department: '', batch: '', page: '1', limit: '20' })
  const depts = useApi('/departments')
  const list = useApi(`/admin/imported-students${qs({ ...f, page: f.page === '1' ? '' : f.page })}`)
  const rows = list.data?.items || []
  return (
    <>
      <p className="notice">{t('ad.stu.importedNote')}{list.data?.sample ? ` ${t('students.sample')}` : ''}</p>
      <div className="ad-filters">
        <SearchBox value={f.q} onChange={(q) => set({ q })} placeholder={t('ad.stu.searchName')} />
        <Select value={f.department} onChange={(department) => set({ department })} label={t('auth.dept')} all={t('ad.stu.anyDept')} options={(depts.data?.items || []).map((d) => [d, d])} />
        <Select value={f.batch} onChange={(batch) => set({ batch })} label={t('auth.batch')} all={t('ad.stu.anyBatch')} options={BATCHES.map((b) => [String(b), `${t('auth.batch')} ${n(b)}`])} />
      </div>
      {list.loading && <SkeletonRows />}
      {list.error && <Data q={list}>{() => null}</Data>}
      {list.data && (rows.length === 0 ? <EmptyState title={t('ad.stu.noMatch')} text={t('ad.stu.noMatchHint')} /> : (
        <>
          <table className="table rtable">
            <thead><tr><th scope="col">{t('ad.stu.col.member')}</th><th scope="col">{t('students.dept')}</th><th scope="col">{t('students.batch')}</th><th scope="col">{t('students.session')}</th><th scope="col">{t('auth.upazila')}</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td data-label={t('ad.stu.col.member')}><Link to={`/admin/profile/${s.id}`}><span className="ad-person"><Avatar name={s.name} size={32} /><strong>{s.name}</strong></span></Link></td>
                  <td data-label={t('students.dept')}>{s.department || '—'}</td>
                  <td data-label={t('students.batch')}>{s.batch ? n(s.batch) : '—'}</td>
                  <td data-label={t('students.session')}>{s.session || '—'}</td>
                  <td data-label={t('auth.upazila')}>{s.upazila || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager total={list.data.total} page={list.data.page} pages={list.data.pages} limit={f.limit} onPage={(p) => set({ page: p })} onLimit={(limit) => set({ limit })} />
        </>
      ))}
    </>
  )
}
