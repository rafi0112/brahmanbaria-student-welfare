import { Link } from 'react-router-dom'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { ErrorState } from '../components/ui.jsx'
import { PageHeader, SkeletonRows, StatusBadge, useWhen } from './kit.jsx'

const EDIT = { blog: '/admin/blog', place: '/admin/heritage', image: '/admin/gallery', album: '/admin/gallery' }

function Metric({ to, label, value, sub, tone }) {
  return (
    <Link to={to} className={`ad-metric ${tone || ''}`}>
      <span className="ad-metric-label">{label}</span>
      <strong className="num">{value}</strong>
      {sub && <small className="muted">{sub}</small>}
    </Link>
  )
}

export default function Dashboard() {
  const { t, n, lang } = useApp()
  const when = useWhen(lang)
  const res = useApi('/admin/dashboard')
  const d = res.data

  const actionText = (a) => {
    const key = `ad.act.${a}`
    const text = t(key)
    return text === key ? a : text
  }
  const entityPath = (kind, id) => (kind === 'image' || kind === 'album' ? '/admin/gallery' : `${EDIT[kind]}/${id}/edit`)

  return (
    <section aria-labelledby="dash-h">
      <PageHeader title={<span id="dash-h">{t('ad.dash.title')}</span>} desc={t('ad.dash.desc')}
        action={
          <div className="row">
            <Link className="btn btn-dark btn-sm" to="/admin/blog/new">+ {t('ad.dash.addPost')}</Link>
            <Link className="btn btn-ghost btn-sm" to="/admin/heritage/new">+ {t('ad.dash.addPlace')}</Link>
          </div>
        } />
      {res.loading && <SkeletonRows rows={6} />}
      {res.error && <ErrorState error={res.error} retry={res.retry} />}
      {d && (
        <>
          <div className="ad-metrics">
            <Metric to="/admin/students" label={t('ad.dash.members')} value={n(d.members.total)} sub={`${n(d.members.approved)} ${t('ad.status.approved')}`} />
            <Metric to="/admin/students?status=pending" label={t('ad.dash.pending')} value={n(d.members.pending)} sub={t('ad.dash.needsReview')} tone={d.members.pending ? 'ad-warn' : ''} />
            <Metric to="/admin?tab=roles" label={t('ad.dash.admins')} value={n(d.admins)} />
            <Metric to="/admin?tab=committee" label={t('ad.dash.committeeNow')} value={n(d.committees.currentMembers)}
              sub={`${n(d.committees.published)} ${t('ad.status.published')} · ${n(d.committees.archived)} ${t('ad.status.archived')}`} />
            <Metric to="/admin/blog?status=published" label={t('ad.dash.postsPublished')} value={n(d.blog.published)} sub={`${n(d.blog.draft)} ${t('ad.status.draft')}`} />
            <Metric to="/admin/heritage" label={t('ad.dash.places')} value={n(d.places.published)} sub={`${n(d.places.draft)} ${t('ad.status.draft')} · ${n(d.places.archived)} ${t('ad.status.archived')}`} />
            <Metric to="/admin/gallery" label={t('ad.dash.images')} value={n(d.gallery.images.published)} sub={`${n(d.gallery.albums.published + d.gallery.albums.draft)} ${t('ad.dash.albums')}`} />
            <Metric to="/admin/students?tab=imported" label={t('ad.dash.imported')} value={n(d.importedStudents)} sub={t('ad.dash.importedNote')} />
            <div className="ad-metric ad-metric-off" aria-disabled="true">
              <span className="ad-metric-label">{t('ad.dash.messages')}</span>
              <strong>—</strong>
              <small className="muted">{t('ad.dash.messagesOff')}</small>
            </div>
          </div>

          <h3>{t('ad.dash.attention')}</h3>
          <ul className="ad-attention">
            {d.members.pending > 0 && <li><Link to="/admin/students?status=pending">{n(d.members.pending)} {t('ad.dash.attPending')}</Link></li>}
            {d.blog.draft > 0 && <li><Link to="/admin/blog?status=draft">{n(d.blog.draft)} {t('ad.dash.attDrafts')}</Link></li>}
            {d.places.draft > 0 && <li><Link to="/admin/heritage?status=draft">{n(d.places.draft)} {t('ad.dash.attPlaces')}</Link></li>}
            {d.committees.published === 0 && <li><Link to="/admin?tab=committee">{t('ad.dash.attCommittee')}</Link></li>}
            {d.members.deactivated > 0 && <li><Link to="/admin/students?disabled=yes">{n(d.members.deactivated)} {t('ad.dash.attDeactivated')}</Link></li>}
            {!d.members.pending && !d.blog.draft && !d.places.draft && d.committees.published > 0 && !d.members.deactivated && <li className="muted">{t('ad.dash.allClear')}</li>}
          </ul>

          <div className="ad-two">
            <div>
              <h3>{t('ad.dash.recent')}</h3>
              {d.recent.length === 0 ? <p className="muted">{t('ad.dash.noRecent')}</p> : (
                <ul className="ad-list">
                  {d.recent.map((r) => (
                    <li key={`${r.kind}-${r.id}`}>
                      <Link to={entityPath(r.kind, r.id)}>{r.title}</Link>
                      <span className="muted small">{t(`ad.kind.${r.kind}`)} · {when(r.updatedAt)}</span>
                      <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3>{t('ad.dash.activity')}</h3>
              {d.activity.length === 0 ? <p className="muted">{t('ad.dash.noActivity')}</p> : (
                <ul className="ad-list">
                  {d.activity.map((a, i) => (
                    <li key={i}>
                      <span>{actionText(a.action)}{a.detail?.title ? <> — <em>{a.detail.title}</em></> : null}</span>
                      <span className="muted small">{a.actor || t('ad.dash.system')} · {when(a.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
