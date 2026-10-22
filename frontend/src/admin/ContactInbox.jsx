import { useCallback, useEffect, useState } from 'react'
import { api, qs, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Data } from '../components/ui.jsx'
import { Confirm, EmptyState, Field, Modal, Notice, PageHeader, Pager, SkeletonRows, useErrText, useFilters, useNotice, useWhen } from './kit.jsx'
import ListToolbar from './toolbar.jsx'
import DataTable from './DataTable.jsx'
import { MonoAvatar } from './ProfileModal.jsx'

// Messages from the public Contact form. Everything here is plain text (React escapes it); the API decides who may read or answer.
export default function ContactInbox() {
  const { t, lang } = useApp()
  const errText = useErrText()
  const when = useWhen(lang)
  const [f, set] = useFilters({ q: '', status: '', from: '', to: '', page: '1', limit: '20' })
  const list = useApi(`/admin/contact${qs({ ...f, page: f.page === '1' ? '' : f.page })}`)
  const { notice, ok, bad, clear } = useNotice()
  const [openId, setOpenId] = useState(null)
  const rows = list.data?.items || []
  const counts = list.data?.counts || {}
  const filtered = !!(f.q || f.from || f.to || f.status)

  const view = (id, label, status, n) => ({ id, label: n == null ? label : `${label} ${n}`, patch: { status } })
  return (
    <section aria-labelledby="ct-h">
      <PageHeader title={<span id="ct-h">{t('ad.ct.title')}</span>} desc={t('ad.ct.desc')} />
      <ListToolbar section="contact" values={f} set={set} defaults={{ limit: '20' }} total={list.data?.total} loading={list.loading}
        search={{ placeholder: t('ad.ct.search') }}
        views={[
          view('inbox', t('ad.ct.inbox'), '', null), view('new', t('ad.ct.new'), 'new', counts.new), view('read', t('ad.ct.read'), 'read', null),
          view('replied', t('ad.ct.replied'), 'replied', null), view('archived', t('ad.ct.archived'), 'archived', null), view('all', t('ad.status.allShort'), 'all', null),
        ]}
        fields={[{ key: 'from', label: t('ad.from'), type: 'date', advanced: true }, { key: 'to', label: t('ad.to'), type: 'date', advanced: true }]} />
      <p className="muted small">{t('ad.ct.retention')}</p>
      {list.data && !list.data.recipientConfigured && <p className="notice bad" role="status">{t('ad.ct.noRecipient')}</p>}
      {list.data?.simulated && <p className="notice" role="status">{t('ad.ct.simulated')}</p>}
      <Notice notice={notice} onClose={clear} />

      {list.loading && <SkeletonRows />}
      {list.error && <Data q={list}>{() => null}</Data>}
      {list.data && (rows.length === 0 ? <EmptyState title={t(filtered ? 'ad.stu.noMatch' : 'ad.ct.none')} text={filtered ? t('ad.stu.noMatchHint') : t('ad.ct.noneHint')} /> : (
        <>
          <DataTable caption={t('ad.ct.title')} rows={rows} rowKey={(x) => x.id} rowClass={(x) => (x.status === 'new' ? 'is-unread' : '')}
            columns={[
              { id: 'from', label: t('ad.ct.from'), primary: true, width: '28%', cell: (x) => (
                <span className="dt-person"><MonoAvatar name={x.name} size={34} />
                  <span className="dt-twoline"><strong className="dt-clamp">{x.name}</strong><small className="dt-sub dt-trunc" title={x.email}>{x.email}</small></span></span>
              ) },
              { id: 'subject', label: t('ad.ct.subject'), cell: (x) => (
                <div className="dt-stack"><strong className="dt-clamp">{x.subject}</strong><small className="dt-sub dt-clamp">{x.message}</small></div>
              ) },
              { id: 'state', label: t('ad.ct.state'), width: '190px', cell: (x) => (
                <div className="dt-stack">
                  <span className={`st st-ct-${x.status}`}><span className="st-dot" aria-hidden="true" />{t(`ad.ct.${x.status}`)}</span>
                  {x.notifyStatus === 'failed' && <small className="dt-sub is-warn">{t('ad.ct.notifyFailed')}</small>}
                  {x.notifyStatus === 'skipped' && <small className="dt-sub is-warn">{t('ad.ct.notifySkipped')}</small>}
                </div>
              ) },
              { id: 'at', label: t('ad.ct.received'), width: '170px', cell: (x) => <small className="dt-sub">{when(x.createdAt)}</small> },
              { id: 'actions', srLabel: t('ad.actions'), width: '90px', className: 'dt-actions-cell', cell: (x) => (
                <div className="dt-actions"><button type="button" className="btn btn-outline btn-sm" onClick={() => setOpenId(x.id)}>{t('ad.ct.open')}</button></div>
              ) },
            ]} />
          <Pager total={list.data.total} page={list.data.page} pages={list.data.pages} limit={f.limit} onPage={(p) => set({ page: p })} onLimit={(limit) => set({ limit })} />
        </>
      ))}
      {openId && <MessageDrawer id={openId} onClose={() => setOpenId(null)} onChanged={list.retry} notify={{ ok, bad }} errText={errText} />}
    </section>
  )
}

function MessageDrawer({ id, onClose, onChanged, notify, errText }) {
  const { t, lang } = useApp()
  const when = useWhen(lang)
  const [state, setState] = useState({ loading: true, item: null, error: '', simulated: false })
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState('')
  const [fieldErr, setFieldErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await api(`/admin/contact/${id}`)
      setState({ loading: false, item: d.item, error: '', simulated: !!d.simulated })
      return d.item
    } catch (e) { setState({ loading: false, item: null, error: errText(e), simulated: false }); return null }
  }, [id, errText])
  useEffect(() => {
    (async () => {
      const it = await load()
      if (it?.status === 'new') { // opening a new message marks it read; the 30-day expiry is not touched
        try { await api(`/admin/contact/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'read' }) }); await load(); onChanged() } catch { /* stays new */ }
      }
    })()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const m = state.item
  const post = async (path, body, done) => {
    setBusy(true); setErr('')
    try {
      await api(`/admin/contact/${id}/${path}`, { method: 'POST', body: JSON.stringify(body || {}) })
      await load(); onChanged(); if (done) notify.ok(done)
      return true
    } catch (e) { setErr(errText(e)); return false } finally { setBusy(false) }
  }
  const send = async (e) => {
    e.preventDefault()
    if (busy) return
    if (draft.trim().length < 2) { setFieldErr(t('ad.ct.replyShort')); return }
    setFieldErr(''); setBusy(true); setErr('')
    try {
      const d = await api(`/admin/contact/${id}/reply`, { method: 'POST', body: JSON.stringify({ body: draft }) })
      await load(); onChanged()
      notify.ok(d.simulated ? t('ad.ct.sentSimulated') : t('ad.ct.sent'))
      setDraft(''); setReplying(false)
    } catch (e2) {
      await load(); onChanged() // the failed attempt is part of the history; the draft stays for another try
      setErr(e2.message === 'mail_failed' ? t('ad.ct.sendFailed') : (e2.fields?.body || errText(e2)))
    } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try { await api(`/admin/contact/${id}/delete`, { method: 'POST', body: '{}' }); notify.ok(t('ad.ct.deleted')); onChanged(); onClose() } catch (e) { setErr(errText(e)); setConfirm(false) } finally { setBusy(false) }
  }

  return (
    <>
      <Modal title={t('ad.ct.detail')} onClose={onClose} drawer busy={busy} guard={() => replying && draft.trim() !== '' && !window.confirm(t('ad.leaveConfirm'))}>
        {state.loading && <SkeletonRows />}
        {state.error && <p className="notice bad" role="alert">{state.error}</p>}
        {m && (
          <div className="ct-detail">
            <div className="me-head"><MonoAvatar name={m.name} size={48} /><div><strong>{m.name}</strong><a href={`mailto:${encodeURIComponent(m.email)}`}>{m.email}</a></div></div>
            <dl className="me-facts">
              <div><dt>{t('ad.ct.subject')}</dt><dd>{m.subject}</dd></div>
              <div><dt>{t('ad.ct.received')}</dt><dd>{when(m.createdAt)}</dd></div>
              <div><dt>{t('ad.ct.state')}</dt><dd>{t(`ad.ct.${m.status}`)}</dd></div>
              <div><dt>{t('ad.ct.notify')}</dt><dd>{t(`ad.ct.notify.${m.notifyStatus}`)}</dd></div>
              <div><dt>{t('ad.ct.expires')}</dt><dd>{when(m.expiresAt)}</dd></div>
            </dl>
            <p className="ct-body">{m.message}</p>
            <p className="muted small">{t('ad.ct.untrusted')}</p>

            {m.replies?.length > 0 && (
              <div className="ct-thread"><h4 className="me-h">{t('ad.ct.replies')}</h4>
                {m.replies.map((r) => (
                  <div key={r.id} className={`ct-reply ${r.status === 'failed' ? 'is-failed' : ''}`}>
                    <small className="muted">{r.sentBy || '—'} · {when(r.createdAt)} · {r.status === 'sent' ? t('ad.ct.replySent') : t('ad.ct.replyFailed')}</small>
                    <p className="ct-body">{r.body}</p>
                  </div>
                ))}
              </div>
            )}

            {err && <p className="notice bad" role="alert">{err}</p>}
            {replying ? (
              <form onSubmit={send} noValidate className="me-form">
                <p className="muted small">{t('ad.ct.to')}: <strong>{m.email}</strong></p>
                {state.simulated && <p className="notice" role="status">{t('ad.ct.simulated')}</p>}
                <Field label={t('ad.ct.reply')} required error={fieldErr} count={draft.length} max={5000}>
                  {(fid, bad) => <textarea id={fid} rows={7} autoFocus value={draft} maxLength={5000} aria-invalid={bad} disabled={busy} onChange={(e) => setDraft(e.target.value)} />}
                </Field>
                <div className="row">
                  <button type="submit" className="btn btn-dark btn-sm" disabled={busy}>{busy ? t('state.loading') : t('ad.ct.send')}</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (!draft.trim() || window.confirm(t('ad.leaveConfirm'))) { setReplying(false); setDraft('') } }}>{t('admin.roles.cancel')}</button>
                </div>
              </form>
            ) : (
              <div className="row ct-actions">
                <button type="button" className="btn btn-dark btn-sm" onClick={() => setReplying(true)}>{t('ad.ct.replyBtn')}</button>
                {m.status === 'new'
                  ? <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => post('status', { status: 'read' })}>{t('ad.ct.markRead')}</button>
                  : <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => post('status', { status: 'new' })}>{t('ad.ct.markUnread')}</button>}
                {m.status !== 'archived' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={async () => { if (await post('status', { status: 'archived' }, t('ad.ct.archivedDone'))) onClose() }}>{t('ad.ct.archive')}</button>}
                {m.status === 'archived' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => post('status', { status: 'read' }, t('ad.ct.restored'))}>{t('ad.ct.restore')}</button>}
                {(m.notifyStatus === 'failed' || m.notifyStatus === 'skipped') && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => post('notify', {}, t('ad.ct.renotified'))}>{t('ad.ct.retryNotify')}</button>}
                <button type="button" className="btn btn-ghost btn-sm ct-delete" disabled={busy} onClick={() => setConfirm(true)}>{t('ad.ct.delete')}</button>
              </div>
            )}
          </div>
        )}
      </Modal>
      {confirm && <Confirm tone="danger" title={t('ad.ct.delete')} text={t('ad.ct.deleteText')} label={t('ad.ct.delete')} busy={busy} onYes={remove} onNo={() => setConfirm(false)} />}
    </>
  )
}
