import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Avatar, Badge, Data } from '../components/ui.jsx'
import { Logo } from '../components/Sketch.jsx'

const LEVELS = ['dash.public', 'dash.members', 'dash.off']

export function Dashboard() {
  const { t } = useApp()
  const [vis, setVis] = useState({ name: 0, phone: 2, email: 1, blood: 1 })
  return (
    <section className="section wrap narrow">
      <p className="notice">{t('dash.preview')}</p>
      <header className="dash-head">
        <Avatar name="Sample Student" size={72} />
        <div>
          <h1>{t('dash.hello')}, Sample Student</h1>
          <p className="muted">{t('dash.status')}: <Badge tone="gold">{t('dash.pending')}</Badge></p>
        </div>
      </header>
      <h2>{t('dash.visibility')}</h2>
      <div className="vis-list">
        {[['name', 'dash.show.name'], ['phone', 'dash.show.phone'], ['email', 'dash.show.email'], ['blood', 'dash.show.blood']].map(([k, label]) => (
          <fieldset key={k} className="vis-row">
            <legend>{t(label)}</legend>
            <div className="seg" role="radiogroup" aria-label={t(label)}>
              {LEVELS.map((l, i) => (
                <button key={l} role="radio" aria-checked={vis[k] === i} className={vis[k] === i ? 'on' : ''} disabled={k === 'name' && i === 2}
                  onClick={() => setVis({ ...vis, [k]: i })}>{t(l)}</button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  )
}

const QUEUE = [['Tasnia Rahman', 21, 'Finance'], ['Rakib Hasan', 21, 'Law'], ['Mim Akter', 20, 'English']]

export function Admin() {
  const { t, n } = useApp()
  const stats = useApi('/stats')
  const nav = [['dash', '▦'], ['students', '☺'], ['batches', '#'], ['places', '◬'], ['blog', '✎'], ['gallery', '▣'], ['messages', '✉'], ['users', '⚙']]
  const [rows, setRows] = useState(QUEUE)
  return (
    <div className="admin">
      <aside className="admin-side">
        <Link to="/" className="brand brand-light"><Logo size={30} /><span><b>{t('brand')}</b></span></Link>
        <nav aria-label="Admin">
          {nav.map(([k, ic], i) => <NavLink key={k} to="/admin" className={i === 0 ? 'on' : ''} end><span aria-hidden="true">{ic}</span>{t(`admin.nav.${k}`)}</NavLink>)}
        </nav>
      </aside>
      <div className="admin-main">
        <h1>{t('admin.title')}</h1>
        <p className="notice">{t('admin.preview')}</p>
        <Data q={stats}>
          {(s) => (
            <>
              <h2>{t('admin.overview')}</h2>
              <dl className="admin-stats">
                {[['stat.students', s.students], ['stat.alumni', s.alumni], ['stat.batches', s.batches], ['stat.places', s.places]].map(([k, v]) => (
                  <div key={k}><dt>{t(k)}</dt><dd className="num">{n(v)}</dd></div>
                ))}
              </dl>
              <h2>Blood group counts <small className="muted">(aggregate only)</small></h2>
              <div className="bars">
                {Object.entries(s.blood).sort((a, b) => b[1] - a[1]).map(([g, c]) => (
                  <div key={g} className="bar"><span>{g}</span><i style={{ width: `${(c / Math.max(...Object.values(s.blood))) * 100}%` }} /><b className="num">{n(c)}</b></div>
                ))}
              </div>
            </>
          )}
        </Data>
        <h2>{t('admin.queue')}</h2>
        <table className="table">
          <tbody>
            {rows.map(([name, b, d]) => (
              <tr key={name}>
                <td><Avatar name={name} size={34} /> {name}</td><td>{b}</td><td>{d}</td>
                <td className="actions">
                  <button className="btn btn-dark btn-sm" onClick={() => setRows(rows.filter((r) => r[0] !== name))}>{t('admin.approve')}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setRows(rows.filter((r) => r[0] !== name))}>{t('admin.reject')}</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="muted">{t('state.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
