import { Link } from 'react-router-dom'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { ErrorState } from '../components/ui.jsx'
import Icon from './icons.jsx'
import { PageHeader, SkeletonRows, useWhen } from './kit.jsx'


// Horizontal bars for a ranked list (departments, upazilas). Bars are scaled to the largest value; numbers are always shown.
function BarList({ rows, label, n }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <ul className="ch-bars">
      {rows.map((r) => (
        <li key={r.key} className={r.key === 'other' ? 'is-other' : undefined}>
          <span className="ch-bar-label" title={label(r.key)}>{label(r.key)}</span>
          <span className="ch-bar-track"><span className="ch-bar-fill" style={{ width: `${(r.count / max) * 100}%` }} /></span>
          <span className="ch-bar-num num">{n(r.count)}</span>
        </li>
      ))}
    </ul>
  )
}

// Vertical columns over a short ordered axis (months, batches). Each column has a tooltip and the value sits on top.
function Columns({ rows, label, n, title }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div className="ch-cols" role="img" aria-label={`${title}: ${rows.map((r) => `${label(r.key)} ${r.count}`).join(', ')}`}>
      {rows.map((r) => (
        <div key={r.key} className="ch-col" title={`${label(r.key)}: ${n(r.count)}`}>
          <span className="ch-col-num num">{r.count > 0 ? n(r.count) : ''}</span>
          <span className="ch-col-bar" style={{ height: `${Math.max(r.count ? 4 : 0, (r.count / max) * 100)}%` }} />
          <span className="ch-col-label">{label(r.key)}</span>
        </div>
      ))}
    </div>
  )
}

// A donut for a few parts of one whole (membership status), with a legend that carries the numbers.
function Donut({ parts, n, center }) {
  const total = parts.reduce((a, p) => a + p.value, 0)
  const R = 42
  const C = 2 * Math.PI * R
  let at = 0
  return (
    <div className="ch-donut">
      <svg viewBox="0 0 100 100" width="132" height="132" aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--a-line)" strokeWidth="12" />
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => {
          const len = (p.value / total) * C
          const el = <circle key={p.key} cx="50" cy="50" r={R} fill="none" stroke={p.color} strokeWidth="12" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-at} transform="rotate(-90 50 50)" />
          at += len
          return el
        })}
        <text x="50" y="49" textAnchor="middle" className="ch-donut-num">{n(total)}</text>
        <text x="50" y="62" textAnchor="middle" className="ch-donut-sub">{center}</text>
      </svg>
      <ul className="ch-legend">
        {parts.map((p) => <li key={p.key}><i style={{ background: p.color }} aria-hidden="true" />{p.label}<b className="num">{n(p.value)}</b></li>)}
      </ul>
    </div>
  )
}

function ChartCard({ title, sub, children, wide }) {
  return (
    <figure className={`ch-card${wide ? ' is-wide' : ''}`}>
      <figcaption><h3>{title}</h3>{sub && <small>{sub}</small>}</figcaption>
      {children}
    </figure>
  )
}

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
  const ups = useApi('/upazilas')
  const d = res.data
  const upName = (slug) => {
    if (slug === 'other') return t('ad.ch.other')
    const u = (ups.data?.items || []).find((x) => x.slug === slug)
    return u ? (lang === 'bn' ? u.nameBn : u.nameEn).replace(' উপজেলা', '').replace(' Upazila', '') : slug
  }
  const monthName = (k) => new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(`${k}-01T00:00:00Z`))
  const ch = d?.charts
  const first = (profile?.name || user?.email?.split('@')[0] || '').split(' ')[0]

  const actionText = (a) => { const key = `ad.act.${a}`; const text = t(key); return text === key ? a : text }

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
          </div>
          <p className="dash-foot">
            <Link to="/admin?tab=roles">{n(d.admins)} {t('ad.dash.admins')}</Link> · <Link to="/admin/students?tab=imported">{n(d.importedStudents)} {t('ad.dash.imported')} ({n(d.imported?.verified || 0)} {t('ad.imp.verified')})</Link> · <Link to="/admin/contact">{n(d.messages?.new || 0)} {t('ad.dash.messagesNew')}</Link> · <Link to="/admin?tab=committee">{n(d.committees.currentMembers)} {t('ad.dash.committeeNow')}</Link>
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

          {ch && (
            <div className="ch-grid">
              <ChartCard title={t('ad.ch.signups')} sub={t('ad.ch.signupsSub')} wide>
                {ch.signups.every((m) => m.count === 0) && <p className="muted small">{t('ad.ch.noSignups')}</p>}
                <Columns rows={ch.signups} label={monthName} n={n} title={t('ad.ch.signups')} />
              </ChartCard>
              <ChartCard title={t('ad.ch.status')} sub={t('ad.ch.statusSub')}>
                <Donut n={n} center={t('ad.ch.members')} parts={[
                  { key: 'approved', label: t('ad.status.approved'), value: d.members.approved, color: 'var(--a-ok)' },
                  { key: 'pending', label: t('ad.status.pending'), value: d.members.pending, color: 'var(--a-warn)' },
                  { key: 'rejected', label: t('ad.status.rejected'), value: d.members.rejected, color: 'var(--a-bad)' },
                ]} />
              </ChartCard>
              <ChartCard title={t('ad.ch.dept')} sub={`${n(ch.students)} ${t('ad.ch.studentsAll')}`}>
                {ch.byDepartment.length ? <BarList rows={ch.byDepartment} n={n} label={(k) => (k === 'other' ? t('ad.ch.other') : k)} /> : <p className="muted small">{t('ad.ch.none')}</p>}
              </ChartCard>
              <ChartCard title={t('ad.ch.upazila')} sub={`${n(ch.students)} ${t('ad.ch.studentsAll')}`}>
                {ch.byUpazila.length ? <BarList rows={ch.byUpazila} n={n} label={upName} /> : <p className="muted small">{t('ad.ch.none')}</p>}
              </ChartCard>
              <ChartCard title={t('ad.ch.batch')} sub={t('ad.ch.batchSub')}>
                {ch.byBatch.length ? <Columns rows={ch.byBatch} n={n} label={(k) => n(Number(k))} title={t('ad.ch.batch')} /> : <p className="muted small">{t('ad.ch.none')}</p>}
              </ChartCard>
            </div>
          )}
        </>
      )}
    </section>
  )
}
