import { Link } from 'react-router-dom'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import { ErrorState } from '../components/ui.jsx'
import Icon from './icons.jsx'
import { PageHeader, SkeletonRows, useWhen } from './kit.jsx'


// The axis top: four equal whole-number steps of a round size that just cover the largest value, so ticks read 0, 10, 20…
function niceMax(v) {
  const raw = Math.max(1, v) / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((x) => x >= raw && Number.isInteger(x)) || Math.ceil(raw)
  return step * 4
}

// Each chart keeps one hue (its card's --ch-a); a mark's intensity follows its weight, so the largest value is the full
// colour and smaller ones fade toward the card surface. 34 % is the lightest step, still clear of the surface.
const shade = (weight) => `color-mix(in srgb, var(--ch-a) ${Math.round(34 + 66 * Math.max(0, Math.min(1, weight)))}%, var(--a-surface))`

// Ranked horizontal bars (departments, upazilas): rank, label, a bar sized and shaded by its value, count and share.
function BarList({ rows, label, n, total }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <ol className="ch-bars">
      {rows.map((r, i) => (
        <li key={r.key} className={r.key === 'other' ? 'is-other' : undefined} style={{ '--i': i, '--c': shade(r.count / max) }}>
          <span className="ch-rank num" aria-hidden="true">{r.key === 'other' ? '·' : n(i + 1)}</span>
          <span className="ch-bar-label" title={label(r.key)}>{label(r.key)}</span>
          <span className="ch-bar-track"><span className="ch-bar-fill" style={{ '--w': `${(r.count / max) * 100}%` }} /></span>
          <span className="ch-bar-num num">{n(r.count)}<small>{total ? `${n(Math.round((r.count / total) * 100))}%` : ''}</small></span>
        </li>
      ))}
    </ol>
  )
}

// Columns on a real axis: gridlines with round tick values, a column per point shaded by its value, a tooltip on hover or focus.
function Columns({ rows, label, n, title, unit }) {
  const peak = Math.max(0, ...rows.map((r) => r.count))
  const top = niceMax(peak)
  const ticks = [top, top * 0.75, top / 2, top / 4, 0]
  return (
    <div className="ch-plot" role="img" aria-label={`${title}: ${rows.map((r) => `${label(r.key)} ${r.count}`).join(', ')}`}>
      <div className="ch-axis" aria-hidden="true">{ticks.map((v) => <span key={v}>{n(Math.round(v))}</span>)}</div>
      <div className="ch-area">
        <div className="ch-grid-lines" aria-hidden="true">{ticks.map((v) => <i key={v} />)}</div>
        <div className="ch-cols">
          {rows.map((r, i) => (
            <div key={r.key} className="ch-col" tabIndex={0} style={{ '--i': i, '--c': shade(peak ? r.count / peak : 0) }}>
              <span className="ch-col-bar" style={{ '--h': `${(r.count / top) * 100}%` }} data-zero={r.count === 0 || undefined}>
                <span className="ch-tip" role="tooltip"><b className="num">{n(r.count)}</b> {unit}<small>{label(r.key)}</small></span>
              </span>
              <span className="ch-col-label">{label(r.key)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Membership status as a ring with rounded, separated segments; the legend carries counts and shares. Segments are
// shaded by rank (largest full, then lighter), so equal counts still read as separate parts.
function Donut({ parts: raw, n, center }) {
  const order = [...raw].sort((a, b) => b.value - a.value).map((p) => p.key)
  const parts = raw.map((p) => ({ ...p, color: shade(1 - order.indexOf(p.key) / Math.max(1, raw.length - 1)) }))
  const total = parts.reduce((a, p) => a + p.value, 0)
  const R = 40
  const C = 2 * Math.PI * R
  const gap = total > 0 && parts.filter((p) => p.value > 0).length > 1 ? 3 : 0
  let at = 0
  return (
    <div className="ch-donut">
      <svg viewBox="0 0 100 100" width="148" height="148" aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--a-surface-2)" strokeWidth="11" />
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => {
          const len = Math.max(0, (p.value / total) * C - gap)
          const el = <circle key={p.key} className="ch-seg" cx="50" cy="50" r={R} fill="none" stroke={p.color} strokeWidth="11" strokeLinecap={gap ? 'round' : 'butt'} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-at} transform="rotate(-90 50 50)" />
          at += len + gap
          return el
        })}
        <text x="50" y="50" textAnchor="middle" className="ch-donut-num">{n(total)}</text>
        <text x="50" y="63" textAnchor="middle" className="ch-donut-sub">{center}</text>
      </svg>
      <ul className="ch-legend">
        {parts.map((p) => (
          <li key={p.key} style={{ '--lg': p.color }}><i style={{ background: p.color }} aria-hidden="true" /><span>{p.label}</span>
            <b className="num">{n(p.value)}</b><small className="num">{total ? `${n(Math.round((p.value / total) * 100))}%` : '—'}</small></li>
        ))}
      </ul>
    </div>
  )
}

function ChartCard({ title, sub, icon, kpi, kpiLabel, children, wide, accent = 'indigo' }) {
  return (
    <figure className={`ch-card${wide ? ' is-wide' : ''} ch-${accent}`}>
      <figcaption>
        {icon && <span className="ch-ico" aria-hidden="true"><Icon name={icon} size={16} /></span>}
        <span className="ch-head"><h3>{title}</h3>{sub && <small>{sub}</small>}</span>
        {kpi != null && <span className="ch-kpi"><b className="num">{kpi}</b>{kpiLabel && <small>{kpiLabel}</small>}</span>}
      </figcaption>
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
        action={<Link className="btn btn-dark" to="/admin/blog?edit=new"><Icon name="plus" size={16} /> {t('ad.dash.addPost')}</Link>} />
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
                <Link className="btn btn-outline btn-sm" to="/admin/blog?edit=new"><Icon name="blog" size={15} /> {t('ad.dash.addPost')}</Link>
                <Link className="btn btn-outline btn-sm" to="/admin/heritage?edit=new"><Icon name="landmark" size={15} /> {t('ad.dash.addPlace')}</Link>
                <Link className="btn btn-outline btn-sm" to="/admin/gallery"><Icon name="image" size={15} /> {t('ad.dash.openGallery')}</Link>
                <Link className="btn btn-outline btn-sm" to="/admin?tab=committee"><Icon name="star" size={15} /> {t('ad.dash.manageCommittee')}</Link>
              </div>
            </div>

            <div className="dash-col">
              <h3 className="dash-h">{t('ad.dash.activity')} <Link className="dash-more" to="/admin/activity">{t('ad.dash.viewAll')}</Link></h3>
              {d.activity.length === 0 ? <p className="muted">{t('ad.dash.noActivity')}</p> : (
                <ul className="dash-rows">
                  {d.activity.slice(0, 3).map((a, i) => (
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
              <ChartCard wide accent="indigo" icon="activity" title={t('ad.ch.signups')} sub={t('ad.ch.signupsSub')}
                kpi={n(ch.signups.reduce((x, m) => x + m.count, 0))} kpiLabel={`${t('ad.ch.thisMonth')} ${n(ch.signups[ch.signups.length - 1]?.count || 0)}`}>
                {ch.signups.every((m) => m.count === 0) && <p className="ch-empty">{t('ad.ch.noSignups')}</p>}
                <Columns rows={ch.signups} label={monthName} n={n} title={t('ad.ch.signups')} unit={t('ad.ch.unitSignups')} />
              </ChartCard>
              <ChartCard accent="emerald" icon="users" title={t('ad.ch.status')} sub={t('ad.ch.statusSub')}>
                <Donut n={n} center={t('ad.ch.members')} parts={[
                  { key: 'approved', label: t('ad.status.approved'), value: d.members.approved },
                  { key: 'pending', label: t('ad.status.pending'), value: d.members.pending },
                  { key: 'rejected', label: t('ad.status.rejected'), value: d.members.rejected },
                ]} />
              </ChartCard>
              <ChartCard accent="amber" icon="star" title={t('ad.ch.batch')} sub={t('ad.ch.batchSub')} kpi={n(ch.byBatch.length)} kpiLabel={t('ad.ch.batches')}>
                {ch.byBatch.length ? <Columns rows={ch.byBatch} n={n} label={(k) => n(Number(k))} title={t('ad.ch.batch')} unit={t('ad.ch.unitStudents')} /> : <p className="ch-empty">{t('ad.ch.none')}</p>}
              </ChartCard>
              <ChartCard accent="violet" icon="directory" title={t('ad.ch.dept')} sub={t('ad.ch.studentsAll')} kpi={n(ch.students)} kpiLabel={t('ad.ch.students')}>
                {ch.byDepartment.length ? <BarList rows={ch.byDepartment} n={n} total={ch.students} label={(k) => (k === 'other' ? t('ad.ch.other') : k)} /> : <p className="ch-empty">{t('ad.ch.none')}</p>}
              </ChartCard>
              <ChartCard accent="teal" icon="landmark" title={t('ad.ch.upazila')} sub={t('ad.ch.studentsAll')} kpi={n(ch.byUpazila.length)} kpiLabel={t('ad.ch.upazilas')}>
                {ch.byUpazila.length ? <BarList rows={ch.byUpazila} n={n} total={ch.students} label={upName} /> : <p className="ch-empty">{t('ad.ch.none')}</p>}
              </ChartCard>
            </div>
          )}
        </>
      )}
    </section>
  )
}
