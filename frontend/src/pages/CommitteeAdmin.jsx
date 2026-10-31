import { useEffect, useRef, useState } from 'react'
import { api, qs, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Avatar, Badge, Data, Empty, Loading } from '../components/ui.jsx'

const MAX_BYTES = 5 * 1024 * 1024

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id) }, [value, ms])
  return v
}

// Server error codes are stable strings; each one has a translated message.
function useExplain() {
  const { t } = useApp()
  return (err) => {
    if (err?.status === 0 || err?.name === 'TypeError') return t('state.error')
    const key = `cm.e.${err?.message}`
    const text = t(key)
    return text === key ? t('cm.e.generic') : text
  }
}

function Confirm({ text, label, busy, onYes, onNo }) {
  const { t } = useApp()
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onNo()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [busy, onNo])
  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && !busy && onNo()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cm-confirm">
        <p id="cm-confirm">{text}</p>
        <div className="row">
          <button className="btn btn-dark" autoFocus disabled={busy} onClick={onYes}>{busy ? t('state.loading') : label}</button>
          <button className="btn btn-ghost" disabled={busy} onClick={onNo}>{t('admin.roles.cancel')}</button>
        </div>
      </div>
    </div>
  )
}

function Thumb({ x, size = 56 }) {
  const [bad, setBad] = useState(false)
  if (x.photoUrl && !bad) return <img className="exec-thumb" src={x.photoUrl} alt="" width={size} height={size} onError={() => setBad(true)} />
  return <Avatar name={x.name} size={size} />
}

/* ---- photo: a public link (recommended) or a file; either way the server validates and stores it ---- */
function PhotoPicker({ value, onChange }) {
  const { t } = useApp()
  const explain = useExplain()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [local, setLocal] = useState('')
  const [link, setLink] = useState('')
  const [broken, setBroken] = useState(false)
  const input = useRef(null)
  useEffect(() => () => local && URL.revokeObjectURL(local), [local])

  const send = async (form, preview) => {
    setBusy(true); setErr(''); setBroken(false)
    try {
      const r = await api('/admin/executive-photo', { method: 'POST', body: form })
      setLocal(preview || '')
      onChange({ path: r.path, url: r.url })
    } catch (e) { setErr(explain(e)) } finally { setBusy(false) }
  }
  const pick = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!['image/jpeg', 'image/png'].includes(f.type)) { setErr(t('cm.e.file_type')); return }
    if (f.size > MAX_BYTES) { setErr(t('cm.e.photo_too_big')); return }
    const form = new FormData()
    form.append('file', f)
    send(form, URL.createObjectURL(f))
  }
  const useLink = () => {
    if (!link.trim()) return
    const form = new FormData()
    form.append('imageUrl', link.trim())
    send(form, '').then(() => setLink(''))
  }
  const shown = local || value?.url

  return (
    <fieldset className="photo-picker">
      <legend>{t('cm.photo')}</legend>
      <div className="photo-row">
        {shown && !broken
          ? <img className="exec-thumb" src={shown} alt={t('cm.photoPreview')} width={84} height={84} onError={() => setBroken(true)} />
          : <span className="exec-thumb exec-thumb-empty" aria-hidden="true" />}
        <div className="photo-controls">
          {/* a public link is the recommended way; a file from the device is the fallback */}
          <label className="field compact"><span>{t('cm.driveLink')} <span className="photo-rec">{t('photo.recommended')}</span></span>
            <span className="row">
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" inputMode="url" />
              <button type="button" className="btn btn-dark btn-sm" disabled={busy || !link.trim()} onClick={useLink}>{t('cm.useLink')}</button>
            </span>
          </label>
          <input ref={input} type="file" accept="image/jpeg,image/png" onChange={pick} hidden />
          <div className="row">
            <button type="button" className="btn-link" disabled={busy} onClick={() => input.current?.click()}>{t('photo.upload')}</button>
            {value && <button type="button" className="btn-link is-danger" disabled={busy} onClick={() => { onChange(null); setLocal('') }}>{t('cm.removePhoto')}</button>}
          </div>
          <small className="muted">{t('cm.photoHelp')}</small>
          {busy && <small role="status">{t('cm.uploading')}</small>}
          {!busy && value && !err && !broken && <small className="ok-text" role="status">{t('cm.photoOk')}</small>}
          {broken && <small className="err" role="alert">{t('cm.e.photo_show')}</small>}
          {err && <small className="err" role="alert">{err}</small>}
        </div>
      </div>
    </fieldset>
  )
}

/* ---- committee details ---- */
function CommitteeForm({ initial, onSubmit, onCancel, busy, errs }) {
  const { t } = useApp()
  const [v, setV] = useState(initial || { name: '', term: '', description: '', startsOn: '', endsOn: '' })
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  return (
    <form className="card-form cm-form" onSubmit={(e) => { e.preventDefault(); onSubmit(v) }} noValidate>
      <label className="field"><span>{t('cm.name')}</span>
        <input value={v.name} onChange={set('name')} maxLength={100} aria-invalid={!!errs?.name} />{errs?.name && <small className="err">{errs.name}</small>}
      </label>
      <label className="field"><span>{t('cm.term')}</span>
        <input value={v.term} onChange={set('term')} maxLength={80} placeholder="2026–27" />{errs?.term && <small className="err">{errs.term}</small>}
      </label>
      <label className="field"><span>{t('cm.description')}</span>
        <textarea rows="3" value={v.description || ''} onChange={set('description')} maxLength={1000} aria-invalid={!!errs?.description} />{errs?.description && <small className="err">{errs.description}</small>}
      </label>
      <div className="two">
        <label className="field"><span>{t('cm.starts')}</span><input type="date" value={v.startsOn} onChange={set('startsOn')} />{errs?.startsOn && <small className="err">{errs.startsOn}</small>}</label>
        <label className="field"><span>{t('cm.ends')}</span><input type="date" value={v.endsOn} onChange={set('endsOn')} />{errs?.endsOn && <small className="err">{errs.endsOn}</small>}</label>
      </div>
      <div className="row">
        <button className="btn btn-dark btn-sm" disabled={busy}>{busy ? t('state.loading') : t('cm.save')}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>{t('admin.roles.cancel')}</button>
      </div>
    </form>
  )
}

/* ---- one executive seat: add (pick a member or a person without an account) or edit ---- */
function ExecutiveForm({ initial, onSubmit, onCancel, busy, errs }) {
  const { t } = useApp()
  const editing = !!initial
  const [guest, setGuest] = useState(false)
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [member, setMember] = useState(null) // {id, name, email}
  const [v, setV] = useState({ name: initial?.name || '', designation: initial?.designation || '', bio: initial?.bio || '' })
  const [photo, setPhoto] = useState(initial?.photo ? { path: initial.photo, url: initial.photoUrl } : null)
  const [bad, setBad] = useState({})
  const found = useApi(!editing && !guest && dq.trim().length >= 2 ? `/admin/users${qs({ q: dq.trim(), limit: 6 })}` : null)

  const submit = (e) => {
    e.preventDefault()
    const problems = {}
    if (!editing && !guest && !member) problems.member = t('cm.e.pick_member')
    if ((guest || editing) && v.name.trim().length < 2) problems.name = t('cm.e.name')
    if (v.designation.trim().length < 2) problems.designation = t('cm.e.designation')
    setBad(problems)
    if (Object.keys(problems).length) return
    onSubmit({
      userId: !editing && !guest ? member.id : '',
      name: guest || editing ? v.name.trim() : '',
      designation: v.designation.trim(), bio: v.bio.trim(), photo: photo?.path || '',
    })
  }
  const all = { ...errs, ...bad }
  return (
    <form className="card-form cm-form" onSubmit={submit} noValidate>
      <h3>{t(editing ? 'cm.editTitle' : 'cm.addTitle')}</h3>
      {!editing && (
        <>
          <label className="check"><input type="checkbox" checked={guest} onChange={(e) => { setGuest(e.target.checked); setMember(null) }} /> {t('cm.noAccount')}</label>
          {!guest && (
            <div className="field">
              <span>{t('cm.pickMember')}</span>
              {member ? (
                <div className="row picked">
                  <strong>{member.name || member.email}</strong><small className="muted">{member.email}</small>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMember(null)}>{t('cm.change')}</button>
                </div>
              ) : (
                <>
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.roles.search')} aria-label={t('cm.pickMember')} />
                  {dq.trim().length >= 2 && (
                    found.loading ? <Loading /> : (
                      <ul className="pick-list">
                        {(found.data?.items || []).map((u) => (
                          <li key={u.id}><button type="button" onClick={() => { setMember(u); setQ(''); setV((s) => ({ ...s })) }}>
                            <strong>{u.name || u.email}</strong> <small className="muted">{u.email}</small>
                          </button></li>
                        ))}
                        {found.data && found.data.items.length === 0 && <li className="muted">{t('admin.roles.none')}</li>}
                      </ul>
                    )
                  )}
                </>
              )}
              {all.member && <small className="err">{all.member}</small>}
              {all.userId && <small className="err">{all.userId}</small>}
            </div>
          )}
        </>
      )}
      {(guest || editing) && (
        <label className="field"><span>{t('cm.personName')}</span>
          <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} aria-invalid={!!all.name} />{all.name && <small className="err">{all.name}</small>}
        </label>
      )}
      <label className="field"><span>{t('cm.designation')}</span>
        <input value={v.designation} onChange={(e) => setV({ ...v, designation: e.target.value })} maxLength={80} placeholder={t('cm.designationHint')} aria-invalid={!!all.designation} />
        {all.designation && <small className="err">{all.designation}</small>}
      </label>
      <label className="field"><span>{t('cm.bio')} <small className="muted">{v.bio.length}/500</small></span>
        <textarea rows={3} value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} maxLength={500} />{all.bio && <small className="err">{all.bio}</small>}
      </label>
      <PhotoPicker value={photo} onChange={setPhoto} />
      <div className="row">
        <button className="btn btn-dark btn-sm" disabled={busy}>{busy ? t('state.loading') : t('cm.save')}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>{t('admin.roles.cancel')}</button>
      </div>
    </form>
  )
}

/* ---- the whole section ---- */
export default function CommitteeManager() {
  const { t, n } = useApp()
  const explain = useExplain()
  const list = useApi('/admin/committees')
  const [sel, setSel] = useState(null)
  const [cq, setCq] = useState('')
  const [cs, setCs] = useState('')
  const detail = useApi(sel ? `/admin/committees/${sel}` : null)
  const [mode, setMode] = useState(null) // 'new' | 'edit' | 'add' | {edit: executive}
  const [confirm, setConfirm] = useState(null) // {text, label, run}
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [errs, setErrs] = useState(null)

  // open the published panel (or the newest) the first time the list arrives
  useEffect(() => {
    const items = list.data?.items
    if (items && !sel && items.length) setSel((items.find((c) => c.status === 'published') || items[0]).id)
  }, [list.data, sel])

  // a form opened lower on the page (phones stack the list above it) is brought into view
  useEffect(() => {
    if (!mode) return undefined
    const id = setTimeout(() => document.querySelector('.cm-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    return () => clearTimeout(id)
  }, [mode])

  const refresh = () => { list.retry(); detail.retry() }
  const run = async (fn, doneKey = 'cm.saved') => {
    setBusy(true); setMsg(null); setErrs(null)
    try {
      const r = await fn()
      setMsg({ tone: 'ok', text: t(doneKey) })
      setMode(null); setConfirm(null)
      refresh()
      return r
    } catch (e) {
      if (e.fields) setErrs(e.fields)
      setMsg({ tone: 'bad', text: explain(e) })
      setConfirm(null)
    } finally { setBusy(false) }
    return undefined
  }
  const body = (b) => JSON.stringify(b)
  const c = detail.data?.committee
  const members = detail.data?.members || []
  const frozen = c?.status === 'archived'

  const createCommittee = async (v) => {
    const r = await run(() => api('/admin/committees', { method: 'POST', body: body(v) }), 'cm.created')
    if (r?.id) setSel(r.id)
  }
  const move = (i, d) => {
    const ids = members.map((x) => x.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    run(() => api(`/admin/committees/${sel}/reorder`, { method: 'POST', body: body({ ids }) }), 'cm.reordered')
  }
  const status = (action, text, label) => setConfirm({ text, label, run: () => run(() => api(`/admin/committees/${sel}/${action}`, { method: 'POST' }), `cm.done.${action}`) })

  return (
    <section aria-labelledby="cm-h">
      <header className="ad-head"><h2 id="cm-h">{t('cm.title')}</h2><p>{t('cm.lede')}</p></header>
      <div aria-live="polite">{msg && <p className={`notice ${msg.tone}`} role={msg.tone === 'bad' ? 'alert' : 'status'}>{msg.text}</p>}</div>

      <div className="cm-layout">
        <aside className="cm-side">
          <button className="btn btn-dark btn-sm btn-block" onClick={() => { setMode('new'); setErrs(null); setMsg(null) }}>+ {t('cm.new')}</button>
          <div className="cm-filter">
            <input type="search" value={cq} onChange={(e) => setCq(e.target.value)} placeholder={t('cm.search')} aria-label={t('cm.search')} maxLength={100} />
            <select value={cs} onChange={(e) => setCs(e.target.value)} aria-label={t('ad.status')}>
              <option value="">{t('cm.anyStatus')}</option>
              {['draft', 'published', 'archived'].map((k) => <option key={k} value={k}>{t(`cm.status.${k}`)}</option>)}
            </select>
          </div>
          <Data q={list}>
            {(d) => {
              const shown = d.items.filter((x) => (!cs || x.status === cs) && (!cq.trim() || `${x.name} ${x.term}`.toLowerCase().includes(cq.trim().toLowerCase())))
              if (d.items.length === 0) return <Empty>{t('cm.noCommittees')}</Empty>
              return (
                <>
                  <p className="muted small" aria-live="polite">{t('ad.tb.showing')} {n(shown.length)} {t('ad.tb.of')} {n(d.items.length)}</p>
                  {shown.length === 0 ? <Empty>{t('ad.stu.noMatch')}</Empty> : (
                    <ul className="cm-list">
                      {shown.map((x) => (
                        <li key={x.id}>
                          <button className={x.id === sel ? 'on' : ''} onClick={() => { setSel(x.id); setMode(null); setMsg(null) }}>
                            <strong>{x.name}</strong>
                            <small className="muted">{[x.term, `${n(x.memberCount)} ${t('cm.members')}`].filter(Boolean).join(' · ')}</small>
                            <Badge tone={x.status === 'published' ? 'gold' : 'muted'}>{t(`cm.status.${x.status}`)}</Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )
            }}
          </Data>
        </aside>

        <div className="cm-main">
          {mode === 'new' && <CommitteeForm busy={busy} errs={errs} onSubmit={createCommittee} onCancel={() => setMode(null)} />}
          {mode !== 'new' && sel && (
            <Data q={detail}>
              {() => !c ? <Loading /> : (
                <>
                  <header className="cm-head">
                    <div>
                      <h3>{c.name} <Badge tone={c.status === 'published' ? 'gold' : 'muted'}>{t(`cm.status.${c.status}`)}</Badge></h3>
                      <p className="muted">{[c.term, c.startsOn && `${c.startsOn} → ${c.endsOn || '…'}`].filter(Boolean).join(' · ')}</p>
                    </div>
                    {!frozen && (
                      <div className="row">
                        {c.status === 'draft' && <button className="btn btn-dark btn-sm" disabled={busy} onClick={() => status('publish', t('cm.confirmPublish'), t('cm.publish'))}>{t('cm.publish')}</button>}
                        {c.status === 'published' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => status('unpublish', t('cm.confirmUnpublish'), t('cm.unpublish'))}>{t('cm.unpublish')}</button>}
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setMode('edit'); setErrs(null) }}>{t('cm.edit')}</button>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => status('archive', t('cm.confirmArchive'), t('cm.archive'))}>{t('cm.archive')}</button>
                      </div>
                    )}
                  </header>
                  {frozen && <p className="notice">{t('cm.frozen')}</p>}

                  {mode === 'edit' && <CommitteeForm initial={{ name: c.name, term: c.term, description: c.description || '', startsOn: c.startsOn, endsOn: c.endsOn }} busy={busy} errs={errs}
                    onSubmit={(v) => run(() => api(`/admin/committees/${sel}`, { method: 'PATCH', body: body(v) }))} onCancel={() => setMode(null)} />}

                  {members.length === 0 ? <Empty>{t('cm.noMembers')}</Empty> : (
                    <ol className="exec-list">
                      {members.map((x, i) => (
                        <li key={x.id} className="exec-row">
                          <Thumb x={x} />
                          <div className="exec-text">
                            <strong>{x.name}</strong>
                            <span>{x.designation}</span>
                            {x.userId && <small className="muted">{t('cm.linked')}</small>}
                          </div>
                          {!frozen && (
                            <div className="exec-actions">
                              <button className="btn btn-ghost btn-sm" aria-label={t('cm.up')} disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
                              <button className="btn btn-ghost btn-sm" aria-label={t('cm.down')} disabled={busy || i === members.length - 1} onClick={() => move(i, 1)}>↓</button>
                              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setMode({ edit: x }); setErrs(null) }}>{t('cm.edit')}</button>
                              <button className="btn btn-ghost btn-sm" disabled={busy}
                                onClick={() => setConfirm({ text: t('cm.confirmRemove').replace('{who}', x.name), label: t('cm.remove'),
                                  run: () => run(() => api(`/admin/executives/${x.id}/remove`, { method: 'POST' }), 'cm.removed') })}>{t('cm.remove')}</button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}

                  {!frozen && mode !== 'add' && !mode?.edit && <button className="btn btn-dark btn-sm" onClick={() => { setMode('add'); setErrs(null); setMsg(null) }}>+ {t('cm.add')}</button>}
                  {mode === 'add' && <ExecutiveForm busy={busy} errs={errs} onCancel={() => setMode(null)}
                    onSubmit={(v) => run(() => api(`/admin/committees/${sel}/members`, { method: 'POST', body: body(v) }), 'cm.added')} />}
                  {mode?.edit && <ExecutiveForm key={mode.edit.id} initial={mode.edit} busy={busy} errs={errs} onCancel={() => setMode(null)}
                    onSubmit={(v) => run(() => api(`/admin/executives/${mode.edit.id}`, { method: 'PATCH', body: body({ name: v.name, designation: v.designation, bio: v.bio, photo: v.photo }) }))} />}
                </>
              )}
            </Data>
          )}
        </div>
      </div>
      {confirm && <Confirm text={confirm.text} label={confirm.label} busy={busy} onYes={confirm.run} onNo={() => setConfirm(null)} />}
    </section>
  )
}
