import { useMemo } from 'react'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Data } from '../components/ui.jsx'
import { EmptyState, PageHeader, SkeletonRows, useFilters, useWhen } from './kit.jsx'
import ListToolbar from './toolbar.jsx'

const AREAS = ['blog', 'place', 'image', 'album', 'member', 'role', 'committee', 'executive']

// A read-only timeline of what admins did, taken from the audit tables (never from frontend events).
export default function ActivityPage() {
  const { t, n, lang } = useApp()
  const when = useWhen(lang)
  const [f, set] = useFilters({ q: '', area: '' })
  const res = useApi('/admin/activity?limit=200')
  const label = (a) => { const key = `ad.act.${a}`; const text = t(key); return text === key ? a : text }
  const rows = useMemo(() => (res.data?.items || []).filter((r) => {
    if (f.area && !r.action.startsWith(`${f.area}.`)) return false
    const hay = `${label(r.action)} ${r.actor} ${r.detail?.title || ''}`.toLowerCase()
    return !f.q || hay.includes(f.q.toLowerCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [res.data, f.q, f.area, t])

  return (
    <section aria-labelledby="act-h">
      <PageHeader title={<span id="act-h">{t('ad.act.title')}</span>} desc={t('ad.act.desc')} />
      <ListToolbar section="activity" values={{ ...f, page: '1', limit: String(Math.max(rows.length, 1)) }} set={set} total={rows.length} loading={res.loading}
        search={{ placeholder: t('ad.act.search') }}
        fields={[{ key: 'area', label: t('ad.act.area'), all: t('ad.act.anyArea'), options: AREAS.map((a) => [a, t(`ad.act.area.${a}`)]) }]} />
      {res.loading && <SkeletonRows />}
      {res.error && <Data q={res}>{() => null}</Data>}
      {res.data && (rows.length === 0 ? <EmptyState title={t('ad.act.none')} text={t('ad.noMatchHint')} /> : (
        <ul className="ad-list ad-timeline">
          {rows.map((r, i) => (
            <li key={i}>
              <span><strong>{label(r.action)}</strong>{r.detail?.title ? <> — <em>{r.detail.title}</em></> : null}</span>
              <span className="muted small">{r.actor || t('ad.dash.system')} · {when(r.at)}</span>
            </li>
          ))}
        </ul>
      ))}
      <p className="muted small">{t('ad.act.limit').replace('{n}', n(200))}</p>
    </section>
  )
}
