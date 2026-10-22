import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, qs, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Data } from '../components/ui.jsx'
import { Confirm, EmptyState, Notice, PageHeader, Pager, RowMenu, SkeletonRows, StatusBadge, useErrText, useFilters, useNotice, useWhen } from './kit.jsx'
import ListToolbar from './toolbar.jsx'
import DataTable from './DataTable.jsx'

const NEXT = {
  draft: [['publish', 'ad.act2.publish'], ['archive', 'ad.act2.archive']],
  published: [['unpublish', 'ad.act2.unpublish'], ['archive', 'ad.act2.archive']],
  archived: [['restore', 'ad.act2.restore'], ['publish', 'ad.act2.publish']],
}

export function actionConfirm(t, action, title) {
  return t(`ad.confirm.${action}`).replace('{title}', title)
}

/* ---------------------------------------------------------------- list (blog posts, places, images) */

// `columns` renders the kind-specific cells; everything else (filters, paging, bulk, status flow) is shared.
export function ContentList({ kind, title, desc, addLabel, addPath, editPath, publicPath, columns, extra = [], emptyHint, searchPlaceholder }) {
  const { t, lang, n } = useApp()
  const when = useWhen(lang)
  const errText = useErrText()
  const [f, set] = useFilters({ q: '', status: '', from: '', to: '', sort: 'updated', page: '1', limit: '20', ...Object.fromEntries(extra.map((x) => [x.key, ''])) })
  const query = qs({ ...f, page: f.page === '1' ? '' : f.page })
  const list = useApi(`/admin/content/${kind}${query}`)
  const { notice, ok, bad, clear } = useNotice()
  const [picked, setPicked] = useState([])
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const rows = list.data?.items || []
  useEffect(() => setPicked([]), [query])
  const filtered = Object.entries(f).some(([k, v]) => v && !['page', 'limit', 'sort'].includes(k))
  const clearAll = () => set({ q: '', status: '', from: '', to: '', ...Object.fromEntries(extra.map((x) => [x.key, ''])) })

  const run = async (action, ids, title) => {
    setBusy(true); clear()
    try {
      if (ids.length === 1) {
        await api(`/admin/content/${kind}/${ids[0]}/${action}`, { method: 'POST' })
        ok(t(`ad.done.${action}`))
      } else {
        const r = await api(`/admin/content/${kind}/bulk`, { method: 'POST', body: JSON.stringify({ ids, action }) })
        ok(`${t('ad.bulkDone').replace('{n}', n(r.done))}${r.failed?.length ? ` ${t('ad.bulkFailed').replace('{n}', n(r.failed.length))}` : ''}`)
        setPicked(r.failed.map((x) => x.id))
      }
      list.retry()
    } catch (e) { bad(errText(e)) } finally { setBusy(false); setConfirm(null) }
    return title
  }
  const ask = (action, ids, label) => setConfirm({ action, ids, text: ids.length === 1 ? actionConfirm(t, action, label) : t(`ad.confirmBulk.${action}`).replace('{n}', n(ids.length)) })
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const allOnPage = rows.length > 0 && rows.every((r) => picked.includes(r.id))

  return (
    <section aria-labelledby={`${kind}-h`}>
      <PageHeader title={<span id={`${kind}-h`}>{title}</span>} desc={desc} action={addPath && <Link className="btn btn-dark btn-sm" to={addPath}>+ {addLabel}</Link>} />
      <ListToolbar section={kind} values={f} set={set} defaults={{ sort: 'updated', limit: '20' }} total={list.data?.total} loading={list.loading}
        search={{ placeholder: searchPlaceholder || t('ad.search') }}
        views={[
          { id: 'active', label: t('ad.status.activeShort'), patch: { status: '' } }, { id: 'draft', label: t('ad.status.draft'), patch: { status: 'draft' } },
          { id: 'published', label: t('ad.status.published'), patch: { status: 'published' } }, { id: 'archived', label: t('ad.status.archived'), patch: { status: 'archived' } },
          { id: 'all', label: t('ad.status.allShort'), patch: { status: 'all' } },
        ]}
        fields={[
          ...extra.map((x) => ({ key: x.key, label: x.label, all: x.all, options: x.options, type: x.text ? 'text' : 'select', advanced: !!x.advanced })),
          { key: 'from', label: t('ad.from'), type: 'date', advanced: true }, { key: 'to', label: t('ad.to'), type: 'date', advanced: true },
        ]}
        sorts={[['updated', t('ad.sort.updated')], ['published', t('ad.sort.published')], ['title', t('ad.sort.title')], ['order', t('ad.sort.order')]]} />
      <Notice notice={notice} onClose={clear} />
      {picked.length > 0 && (
        <div className="ad-bulk" role="region" aria-label={t('ad.bulk')}>
          <strong>{n(picked.length)} {t('ad.selected')}</strong>
          {['publish', 'unpublish', 'archive', 'restore'].map((a) => <button key={a} type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => ask(a, picked, '')}>{t(`ad.act2.${a}`)}</button>)}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked([])}>{t('ad.clearSel')}</button>
        </div>
      )}
      {list.loading && <SkeletonRows />}
      {list.error && <Data q={list}>{() => null}</Data>}
      {list.data && (rows.length === 0 ? (
        <EmptyState title={t(filtered ? 'ad.noMatch' : 'ad.nothingYet')} text={filtered ? t('ad.noMatchHint') : emptyHint}
          action={filtered ? <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>{t('common.clear')}</button> : addPath && <Link className="btn btn-dark btn-sm" to={addPath}>+ {addLabel}</Link>} />
      ) : (
        <>
          <DataTable caption={title} rows={rows} rowKey={(r) => r.id}
            selection={{ picked, toggle, allOn: allOnPage, toggleAll: () => setPicked(allOnPage ? [] : rows.map((r) => r.id)), name: (r) => r.title }}
            columns={[
              ...columns.map((col, i) => ({ id: col.label, label: col.label, width: col.width, primary: i === 0, cell: col.render })),
              { id: 'status', label: t('ad.status'), width: '148px', cell: (r) => <div className="dt-stack"><StatusBadge status={r.status} /><small className="dt-sub">{when(r.updatedAt)}</small></div> },
              {
                id: 'actions', srLabel: t('ad.actions'), width: '116px', className: 'dt-actions-cell', cell: (r) => (
                  <div className="dt-actions">
                    <Link className="btn btn-ghost btn-sm" to={editPath(r)}>{t('ad.edit')}</Link>
                    <RowMenu label={`${t('ad.actions')}: ${r.title}`} items={[
                      ...NEXT[r.status].map(([act, label]) => ({ label: t(label), onClick: () => ask(act, [r.id], r.title), disabled: busy, danger: act === 'archive' })),
                      r.status === 'published' && publicPath ? { label: t('ad.openPublic'), href: publicPath(r) } : null,
                    ]} />
                  </div>
                ),
              },
            ]} />
          <Pager total={list.data.total} page={list.data.page} pages={list.data.pages} limit={f.limit} onPage={(p) => set({ page: p })} onLimit={(limit) => set({ limit })} />
        </>
      ))}
      {confirm && <Confirm text={confirm.text} detail={confirm.action === 'archive' ? <p className="muted small">{t('ad.archiveNote')}</p> : null}
        label={t(`ad.act2.${confirm.action}`)} busy={busy} onYes={() => run(confirm.action, confirm.ids)} onNo={() => setConfirm(null)} />}
    </section>
  )
}

/* ---------------------------------------------------------------- editor plumbing */

// Loads one entry (or starts a blank one), saves it and moves it through draft / published / archived.
export function useEntryEditor(kind, id, listPath) {
  const { t } = useApp()
  const errText = useErrText()
  const nav = useNavigate()
  const existing = useApi(id ? `/admin/content/${kind}/${id}` : null)
  const [entry, setEntry] = useState(null)
  const entryRef = useRef(null)
  const [fields, setFields] = useState({})
  const [busy, setBusy] = useState(false)
  const { notice, ok, bad, clear } = useNotice()
  useEffect(() => { entryRef.current = entry }, [entry])
  useEffect(() => { if (existing.data) setEntry(existing.data) }, [existing.data])

  const save = useCallback(async (body, afterCreatePath) => {
    setBusy(true); setFields({}); clear()
    try {
      const saved = id ? await api(`/admin/content/${kind}/${id}`, { method: 'PATCH', body: JSON.stringify({ ...body, expectedUpdatedAt: entryRef.current?.updatedAt || '' }) })
        : await api(`/admin/content/${kind}`, { method: 'POST', body: JSON.stringify(body) })
      setEntry(saved)
      ok(t('ad.saved'))
      if (!id && afterCreatePath) nav(afterCreatePath(saved), { replace: true })
      return saved
    } catch (e) {
      if (e.fields) setFields(e.fields)
      bad(e.fields ? t('ad.e.validation') : errText(e))
      return null
    } finally { setBusy(false) }
  }, [id, kind, nav, ok, bad, clear, t, errText])

  const act = useCallback(async (action) => {
    if (!entry) return null
    setBusy(true); clear()
    try {
      const e = await api(`/admin/content/${kind}/${entry.id}/${action}`, { method: 'POST' })
      setEntry(e)
      ok(t(`ad.done.${action}`))
      return e
    } catch (e) { bad(errText(e)); return null } finally { setBusy(false) }
  }, [entry, kind, ok, bad, clear, t, errText])

  return { existing, entry, fields, busy, notice, clear, save, act, ok, bad, listPath }
}

// Publish / archive controls shown next to every editor.
export function StatusPanel({ entry, busy, onAct, dirty, publicUrl, onPreview, title }) {
  const { t } = useApp()
  const [confirm, setConfirm] = useState(null)
  return (
    <aside className="ad-side-card">
      <h4>{t('ad.publishing')}</h4>
      {entry ? <p><StatusBadge status={entry.status} /></p> : <p className="muted">{t('ad.notSaved')}</p>}
      {dirty && <p className="notice small">{t('ad.unsaved')}</p>}
      {entry && (
        <div className="ad-stack">
          {NEXT[entry.status].map(([a, label]) => (
            <button key={a} type="button" className={`btn btn-sm ${a === 'publish' ? 'btn-dark' : 'btn-ghost'}`} disabled={busy || dirty} onClick={() => setConfirm(a)}
              title={dirty ? t('ad.saveFirst') : undefined}>{t(label)}</button>
          ))}
          {entry.status === 'published' && publicUrl && <a className="btn btn-ghost btn-sm" href={publicUrl} target="_blank" rel="noreferrer">{t('ad.openPublic')}</a>}
        </div>
      )}
      {onPreview && <button type="button" className="btn btn-ghost btn-sm" onClick={onPreview}>{t('ad.preview')}</button>}
      {confirm && <Confirm text={actionConfirm(t, confirm, title || entry.title)} detail={confirm === 'archive' ? <p className="muted small">{t('ad.archiveNote')}</p> : null}
        label={t(`ad.act2.${confirm}`)} busy={busy} onYes={async () => { await onAct(confirm); setConfirm(null) }} onNo={() => setConfirm(null)} />}
    </aside>
  )
}

export function EditorGate({ editor, children }) {
  if (editor.existing.loading) return <SkeletonRows rows={6} />
  if (editor.existing.error) return <Data q={editor.existing}>{() => null}</Data>
  return children
}
