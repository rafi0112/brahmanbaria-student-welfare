import { Link } from 'react-router-dom'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { ErrorState } from '../components/ui.jsx'
import Icon from './icons.jsx'
import { PageHeader, SkeletonRows, StatusBadge, useWhen } from './kit.jsx'

const EDIT = { blog: '/admin/blog', place: '/admin/heritage', image: '/admin/gallery', album: '/admin/gallery' }

function Stat({ to, label, value, sub, warn }) {
  return (
    <Link to={to} className={`dash-stat ${warn ? 'is-warn' : ''}`}>
      <span className="dash-stat-label">{label}</span>
      <strong className="num">{value}</strong>
      <small>{sub}</small>
    </Link>
  )
}

export default function Dashboard() {
  const { t, n, lang } = useApp()
  const { profile, user } = useAuth()
  const when = useWhen(lang)
  const res = useApi('/admin/dashboard')
  const d = res.data
  const first = (profile?.name || user?.email?.split('@')[0] || '').split(' ')[0]

  const actionText = (a) => { const key = `ad.act.${a}`; const text = t(key); return text === key ? a : text }
  const entityPath = (kind, id) => (kind === 'image' || kind === 'album' ? '/admin/gallery' : `${EDIT[kind]}/${id}/edit`)

  const attention = d && [
    d.messages?.new > 0 && { to: '/admin/contact?status=new', text: `${n(d.messages.new)} ${t('ad.dash.attMessages')}`, tone: 'warn' },
    d.members.pending > 0 && { to: '/admin/students?tab=requests', text: `${n(d.members.pending)} ${t('ad.dash.attPending')}`, tone: 'warn' },
    d.members.incomplete > 0 && { to: '/admin/students?tab=members&complete=no', text: `${n(d.members.incomplete)} ${t('ad.dash.attIncomplete')}` },
    d.imported?.awaiting > 0 && { to: '/admin/students?tab=imported&status=awaiting', text: `${n(d.imported.awaiting)} ${t('ad.dash.attImported')}` },
    d.blog.draft > 0 && { to: '/admin/blog?status=draft', text: `${n(d.blog.draft)} ${t('ad.dash.attDrafts')}` },
    d.places.draft > 0 && { to: '/admin/heritage?status=draft', text: `${n(d.places.draft)} ${t('ad.dash.attPlaces')}` },
    d.committees.published === 0 && { to: '/admin?tab=committee', text: t('ad.dash.attCommittee') },
    d.members.deactivated > 0 && { to: '/admin/students?disabled=yes', text: `${n(d.members.deactivated)} ${t('ad.dash.attDeactivated')}` },
  ].filter(Boolean)

  return (
    <section aria-labelledby="dash-h">
      <PageHeader title={<span id="dash-h">{first ? `${t('ad.dash.hello')}, ${first}` : t('ad.dash.title')}</span>} desc={t('ad.dash.desc')}
        action={<Link className="btn btn-dark" to="/admin/blog/new"><Icon name="plus" size={16} /> {t('ad.dash.addPost')}</Link>} />
      {res.loading && <SkeletonRows rows={6} />}
      {res.error && <ErrorState error={res.error} retry={res.retry} />}
      {d && (
        <>
          <div className="dash-stats" role="list">
            <Stat to="/admin/students?tab=members" label={t('ad.dash.members')} value={n(d.members.total)} sub={`${n(d.members.approved)} ${t('ad.status.approved')}`} />
            <Stat to="/admin/students?tab=requests" label={t('ad.dash.pending')} value={n(d.members.pending)} sub={t('ad.dash.needsReview')} warn={d.members.pending > 0} />
            <Stat to="/admin/contact?status=new" label={t('ad.dash.messages')} value={n(d.messages?.new || 0)} sub={`${n(d.messages?.total || 0)} ${t('ad.dash.messagesKept')}`} warn={d.messages?.new > 0} />
            <Stat to="/admin/blog?status=published" label={t('ad.dash.postsPublished')} value={n(d.blog.published)} sub={`${n(d.blog.draft)} ${t('ad.status.draft')}`} />
            <Stat to="/admin/heritage" label={t('ad.dash.places')} value={n(d.places.published)} sub={`${n(d.places.draft)} ${t('ad.status.draft')} · ${n(d.places.archived)} ${t('ad.status.archived')}`} />
            <Stat to="/admin/gallery" label={t('ad.dash.images')} value={n(d.gallery.images.published)} sub={`${n(d.gallery.albums.published + d.gallery.albums.draft)} ${t('ad.dash.albums')}`} />
            <Stat to="/admin?tab=committee" label={t('ad.dash.committeeNow')} value={n(d.committees.currentMembers)} sub={`${n(d.committees.published)} ${t('ad.status.published')}`} />
          </div>
          <p className="dash-foot">
            <Link to="/admin?tab=roles">{n(d.admins)} {t('ad.dash.admins')}</Link> · <Link to="/admin/students?tab=imported">{n(d.importedStudents)} {t('ad.dash.imported')} ({n(d.imported?.verified || 0)} {t('ad.imp.verified')})</Link> · <Link to="/admin/contact">{n(d.messages?.new || 0)} {t('ad.dash.messagesNew')}</Link>
          </p>

          <div className="dash-grid">
            <div className="dash-col">
              <h3 className="dash-h">{t('ad.dash.attention')}</h3>
              {attention.length === 0
                ? <p className="dash-clear"><Icon name="check" size={16} /> {t('ad.dash.allClear')}</p>
                : (
                  <ul className="dash-attn">
                    {attention.map((a) => (
                      <li key={a.to}><Link to={a.to} className={a.tone === 'warn' ? 'is-warn' : ''}><Icon name="alert" size={16} /><span>{a.text}</span><Icon name="chevron" size={14} /></Link></li>
                    ))}
                  </ul>
                )}
              <h3 className="dash-h">{t('ad.dash.quick')}</h3>
              <div className="dash-quick">
                <Link className="btn btn-outline btn-sm" to="/admin/students?tab=requests"><Icon name="users" size={15} /> {t('ad.dash.reviewPending')}</Link>
                <Link className="btn btn-outline btn-sm" to="/admin/students?tab=imported"><Icon name="directory" size={15} /> {t('ad.imp.add')}</Link>
                <Link className="btn btn-outline btn-sm" to="/admin/contact"><Icon name="mail" size={15} /> {t('ad.dash.openInbox')}</Link>
                <Link className="btn btn-outline btn-sm" to="/admin/blog/new"><Icon name="blog" size={15} /> {t('ad.dash.addPost')}</Link>
                <Link className="btn btn-outline btn-sm" to="/admin/heritage/new"><Icon name="landmark" size={15} /> {t('ad.dash.addPlace')}</Link>
                <Link className="btn btn-outline btn-sm" to="/admin/gallery"><Icon name="image" size={15} /> {t('ad.dash.openGallery')}</Link>
                <Link className="btn btn-outline btn-sm" to="/admin?tab=committee"><Icon name="star" size={15} /> {t('ad.dash.manageCommittee')}</Link>
              </div>
            </div>

            <div className="dash-col">
              <h3 className="dash-h">{t('ad.dash.recent')}</h3>
              {d.recent.length === 0 ? <p className="muted">{t('ad.dash.noRecent')}</p> : (
                <ul className="dash-rows">
                  {d.recent.map((r) => (
                    <li key={`${r.kind}-${r.id}`}>
                      <Link to={entityPath(r.kind, r.id)} className="dash-row-main"><span className="dt-trunc" title={r.title}>{r.title}</span><small>{t(`ad.kind.${r.kind}`)} · {when(r.updatedAt)}</small></Link>
                      <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="dash-h">{t('ad.dash.activity')} <Link className="dash-more" to="/admin/activity">{t('ad.dash.viewAll')}</Link></h3>
              {d.activity.length === 0 ? <p className="muted">{t('ad.dash.noActivity')}</p> : (
                <ul className="dash-rows">
                  {d.activity.slice(0, 6).map((a, i) => (
                    <li key={i}>
                      <span className="dash-row-main"><span>{actionText(a.action)}{a.detail?.title ? <> — <em>{a.detail.title}</em></> : null}</span><small>{a.actor || t('ad.dash.system')} · {when(a.at)}</small></span>
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
