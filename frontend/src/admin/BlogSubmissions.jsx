import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, useApi, usePhoto } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Data } from '../components/ui.jsx'
import { Confirm, EmptyState, Modal, Notice, PageHeader, SkeletonRows, useErrText, useNotice, useWhen } from './kit.jsx'
import { MonoAvatar } from './ProfileModal.jsx'

// Writing that members sent from the Blog page: title, text and up to six pictures, kept in the database. Admins read
// them, save the pictures, mark them, turn one into a blog draft (then edit and publish it as usual) or delete them.
// Nothing here is shown on the site by itself. Everything is plain text (React escapes it).
const VIEWS = ['new', 'read', 'accepted', 'published', 'declined', 'all']
const LABEL = { new: 'ad.bs.st.new', read: 'ad.bs.st.read', accepted: 'ad.bs.st.accepted', published: 'ad.bs.st.published', declined: 'ad.bs.st.declined', all: 'ad.status.allShort' }

export default function BlogSubmissions() {
  const { t, n, lang } = useApp()
  const when = useWhen(lang)
  const [sp, setSp] = useSearchParams()
  const view = VIEWS.includes(sp.get('status')) ? sp.get('status') : 'all'
  const list = useApi(`/admin/blog-submissions?status=${view}`)
  const { notice, ok, bad, clear } = useNotice()
  const [openId, setOpenId] = useState(null)
  const rows = list.data?.items || []
  const counts = list.data?.counts || {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <section aria-labelledby="bs-h">
      <PageHeader title={<span id="bs-h">{t('ad.bs.title')}</span>} desc={t('ad.bs.desc')} />
      <div className="bs-views" role="group" aria-label={t('ad.bs.title')}>
        {VIEWS.map((v) => {
          const c = v === 'all' ? total : counts[v] || 0
          return (
            <button key={v} type="button" className={`chip ${view === v ? 'on' : ''}`} aria-pressed={view === v} onClick={() => setSp(v === 'all' ? {} : { status: v })}>
              {t(LABEL[v])} <span className="bs-count">{n(c)}</span>
            </button>
          )
        })}
      </div>
      <Notice notice={notice} onClose={clear} />
      {list.loading && <SkeletonRows />}
      {list.error && <Data q={list}>{() => null}</Data>}
      {list.data && (rows.length === 0 ? <EmptyState title={t('ad.bs.none')} text={t('ad.bs.noneHint')} /> : (
        <ul className="bs-list">
          {rows.map((x) => (
            <li key={x.id} className={x.status === 'new' ? 'is-unread' : ''}>
              <button type="button" className="bs-row" onClick={() => setOpenId(x.id)}>
                <MonoAvatar name={x.authorName} size={40} />
                <span className="bs-main">
                  <strong>{x.title}</strong>
                  <small className="muted">{x.authorName} · {when(x.createdAt)} · {n(x.photos)} {t('ad.bs.pictures')}</small>
                  <span className="bs-snip">{x.body}</span>
                </span>
                <span className={`st st-bs-${x.status}`}><span className="st-dot" aria-hidden="true" />{t(LABEL[x.status])}</span>
              </button>
            </li>
          ))}
        </ul>
      ))}
      {openId && <SubmissionDrawer id={openId} onClose={() => setOpenId(null)} onChanged={list.retry} notify={{ ok, bad }} />}
    </section>
  )
}

function SubmissionDrawer({ id, onClose, onChanged, notify }) {
  const { t, n, lang } = useApp()
  const when = useWhen(lang)
  const errText = useErrText()
  const go = useNavigate()
  const [state, setState] = useState({ loading: true, item: null, error: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState('')

  const load = useCallback(async () => {
    try { const d = await api(`/admin/blog-submissions/${id}`); setState({ loading: false, item: d.item, error: '' }); return d.item }
    catch (e) { setState({ loading: false, item: null, error: errText(e) }); return null }
  }, [id, errText])
  useEffect(() => {
    (async () => {
      const it = await load()
      if (it?.status === 'new') { // opening it marks it read
        try { await api(`/admin/blog-submissions/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'read' }) }); await load(); onChanged() } catch { /* stays new */ }
      }
    })()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const m = state.item
  const setStatus = async (status) => {
    setBusy(true); setErr('')
    try { await api(`/admin/blog-submissions/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }); await load(); onChanged(); notify.ok(t('ad.bs.saved')) }
    catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  // publish: true is "Approve and publish" (on the site at once); false makes a draft to edit first
  const toPost = async (publish) => {
    setBusy(true); setErr('')
    try {
      const d = await api(`/admin/blog-submissions/${id}/draft`, { method: 'POST', body: JSON.stringify({ publish }) })
      onChanged()
      if (publish) { notify.ok(t('ad.bs.published')); await load(); setBusy(false); setConfirm('') }
      else { notify.ok(t('ad.bs.drafted')); go(`/admin/blog?edit=${d.post.id}`) }
    } catch (e) { setErr(errText(e)); setBusy(false); setConfirm('') }
  }
  const remove = async () => {
    setBusy(true)
    try { await api(`/admin/blog-submissions/${id}/delete`, { method: 'POST', body: '{}' }); notify.ok(t('ad.bs.deleted')); onChanged(); onClose() }
    catch (e) { setErr(errText(e)); setConfirm('') } finally { setBusy(false) }
  }

  return (
    <>
      <Modal title={t('ad.bs.detail')} onClose={onClose} drawer busy={busy}>
        {state.loading && <SkeletonRows />}
        {state.error && <p className="notice bad" role="alert">{state.error}</p>}
        {m && (
          <div className="ct-detail bs-detail">
            <div className="me-head"><MonoAvatar name={m.authorName} size={48} /><div><strong>{m.authorName}</strong>{m.email && <a href={`mailto:${encodeURIComponent(m.email)}`}>{m.email}</a>}</div></div>
            <dl className="me-facts">
              <div><dt>{t('ad.bs.received')}</dt><dd>{when(m.createdAt)}</dd></div>
              <div><dt>{t('ad.bs.state')}</dt><dd>{t(LABEL[m.status])}</dd></div>
            </dl>
            <h3 className="bs-title">{m.title}</h3>
            <p className="ct-body">{m.body}</p>
            {m.photos > 0 && (
              <>
                <h4 className="me-h">{t('ad.bs.picturesT')} ({n(m.photos)})</h4>
                <ul className="bs-photos">{Array.from({ length: m.photos }, (_, i) => <SubPhoto key={i} id={m.id} i={i} title={m.title} />)}</ul>
                <p className="muted small">{t('ad.bs.saveHint')}</p>
              </>
            )}
            <p className="muted small">{t('ad.bs.untrusted')}</p>
            {err && <p className="notice bad" role="alert">{err}</p>}
            <div className="bs-actions">
              {m.status !== 'published' && <button type="button" className="btn btn-dark" disabled={busy} onClick={() => setConfirm('publish')}>{t('ad.bs.approve')}</button>}
              {m.postId
                ? <button type="button" className="btn btn-outline" onClick={() => go(`/admin/blog?edit=${m.postId}`)}>{t(m.status === 'published' ? 'ad.bs.openPost' : 'ad.bs.openDraft')}</button>
                : <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setConfirm('draft')}>{t('ad.bs.toDraft')}</button>}
              {m.status !== 'declined' && m.status !== 'published' && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setStatus('declined')}>{t('ad.bs.decline')}</button>}
              {m.status !== 'new' && m.status !== 'published' && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setStatus('new')}>{t('ad.bs.markNew')}</button>}
              <button type="button" className="btn btn-ghost danger" disabled={busy} onClick={() => setConfirm('delete')}>{t('ad.bs.delete')}</button>
            </div>
          </div>
        )}
      </Modal>
      {confirm === 'publish' && <Confirm title={t('ad.bs.approve')} text={t('ad.bs.approveText')} label={t('ad.bs.approve')} busy={busy} onYes={() => toPost(true)} onNo={() => setConfirm('')} />}
      {confirm === 'draft' && <Confirm title={t('ad.bs.toDraft')} text={t('ad.bs.toDraftText')} label={t('ad.bs.toDraft')} busy={busy} onYes={() => toPost(false)} onNo={() => setConfirm('')} />}
      {confirm === 'delete' && <Confirm tone="danger" title={t('ad.bs.delete')} text={t('ad.bs.deleteText')} label={t('ad.bs.delete')} busy={busy} onYes={remove} onNo={() => setConfirm('')} />}
    </>
  )
}

function SubPhoto({ id, i, title }) {
  const { t, n } = useApp()
  const src = usePhoto(`/api/v1/admin/blog-submissions/${id}/photos/${i}`)
  return (
    <li>
      {src ? <a href={src} target="_blank" rel="noopener noreferrer" title={t('ad.bs.bigger')}><img src={src} alt={`${title} — ${n(i + 1)}`} /></a> : <span className="bs-ph-wait" aria-hidden="true" />}
      {src && <a className="bs-dl" href={src} download={`blog-${id.slice(0, 8)}-${i + 1}.jpg`}>{t('ad.bs.download')}</a>}
    </li>
  )
}
