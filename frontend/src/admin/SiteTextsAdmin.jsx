import { useEffect, useMemo, useState } from 'react'
import { api, useApi } from '../lib/api.js'
import { useApp, setSiteTexts } from '../lib/app.jsx'
import { strings } from '../data/strings.js'
import { Data } from '../components/ui.jsx'
import { Link } from 'react-router-dom'
import { Notice, PageHeader, SearchBox, useErrText, useNotice } from './kit.jsx'
import Icon from './icons.jsx'
import { describe, marksIn } from './textLabels.js'

// Every text of the public site and the member pages, in Bangla and English, changed from here without touching code.
// An admin's wording replaces the built-in one for everyone; emptying a box (or "Use the original") brings the built-in
// wording back. The admin panel's own labels are not listed.

const HIDDEN = new Set(['ad', 'admin', 'cm'])
// which part of the site a text belongs to, by the first part of its name
const GROUPS = [
  ['home', 'হোম পেজ', 'Home page', ['home', 'hero', 'explore', 'stat', 'community', 'stories', 'quick', 'collage', 'featured', 'evc', 'fb']],
  ['about', 'আমাদের সম্পর্কে', 'About', ['about']],
  ['students', 'শিক্ষার্থী', 'Students', ['students']],
  ['alumni', 'অ্যালামনাই', 'Alumni', ['alumni']],
  ['committee', 'কমিটি', 'Committee', ['committee']],
  ['events', 'ইভেন্ট', 'Events', ['events']],
  ['gallery', 'গ্যালারি', 'Gallery', ['gallery']],
  ['heritage', 'ঐতিহ্য ও উপজেলা', 'Heritage and upazilas', ['heritage', 'place', 'cat', 'dir']],
  ['blog', 'ব্লগ', 'Blog', ['blog']],
  ['help', 'যোগাযোগ ও প্রশ্নোত্তর', 'Contact and FAQ', ['help', 'faq', 'contact']],
  ['menu', 'মেনু ও ফুটার', 'Menu and footer', ['nav', 'footer', 'brand', 'brandSub', 'brandFull', 'theme', 'lang']],
  ['account', 'লগইন, নিবন্ধন ও সদস্য পাতা', 'Sign in, registration and member pages', ['auth', 'pw', 'join', 'verified', 'member', 'photo', 'dash', 'acct']],
]
const groupOf = (key) => {
  const p = key.split('.')[0]
  return (GROUPS.find((g) => g[3].includes(p)) || ['other'])[0]
}
const ALL_KEYS = Object.keys(strings.en).filter((k) => !HIDDEN.has(k.split('.')[0]))
const PAGE = 40

// The box holds the wording the site shows now (the original until someone changes it); the admin edits it in place.
const same = (a, b) => (a || '').trim() === (b || '').trim()
const isChanged = (raw, original) => raw !== undefined && raw.trim() !== '' && !same(raw, original)

function Box({ label, lang, raw, original, onChange }) {
  const value = raw ?? original
  const rows = Math.min(8, Math.max(1, Math.ceil(Math.max(value.length, 1) / 55)))
  return (
    <label className="stx-box">
      <span>{label}{isChanged(raw, original) && <em> · {lang === 'bn' ? 'বদলানো' : 'changed'}</em>}</span>
      <textarea lang={lang} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} maxLength={5000} />
    </label>
  )
}

// only the languages whose wording really differs from the original are stored
const clean = (draft) => Object.fromEntries(Object.entries(draft).map(([k, v]) => {
  const out = {}
  if (isChanged(v.bn, strings.bn[k])) out.bn = v.bn.trim()
  if (isChanged(v.en, strings.en[k])) out.en = v.en.trim()
  return [k, out]
}).filter(([, v]) => v.bn || v.en))

export default function SiteTextsAdmin() {
  const { pick, n } = useApp()
  const errText = useErrText()
  const res = useApi('/admin/settings/site-texts')
  const { notice, ok, bad, clear } = useNotice()
  const [saved, setSaved] = useState(null) // { key: { bn, en } } as stored
  const [draft, setDraft] = useState({})
  const [group, setGroup] = useState('home')
  const [q, setQ] = useState('')
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (res.data) { setSaved(res.data.texts || {}); setDraft(res.data.texts || {}) } }, [res.data])
  useEffect(() => setShown(PAGE), [group, q, onlyChanged])

  const norm = (m) => JSON.stringify(Object.entries(clean(m)).sort(([a], [b]) => a.localeCompare(b)))
  const dirty = saved && norm(draft) !== norm(saved)
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const list = useMemo(() => {
    const words = q.trim().toLowerCase()
    return ALL_KEYS.filter((k) => {
      if (onlyChanged && !clean({ [k]: draft[k] || {} })[k]) return false
      if (words) {
        const d = describe(k)
        const hay = `${strings.bn[k] || ''} ${strings.en[k] || ''} ${draft[k]?.bn || ''} ${draft[k]?.en || ''} ${d.where.join(' ')} ${d.what.join(' ')}`.toLowerCase()
        return hay.includes(words)
      }
      return onlyChanged || groupOf(k) === group
    })
  }, [q, group, onlyChanged, draft])
  const changedCount = Object.keys(clean(draft)).length
  const set = (k, lang, value) => setDraft((d) => ({ ...d, [k]: { ...(d[k] || {}), [lang]: value } }))
  const reset = (k) => setDraft((d) => { const x = { ...d }; delete x[k]; return x })

  const save = async () => {
    setBusy(true); clear()
    try {
      const body = clean(draft)
      const r = await api('/admin/settings/site-texts', { method: 'PUT', body: JSON.stringify({ texts: body }) })
      setSaved(r.texts || {}); setDraft(r.texts || {})
      setSiteTexts(r.texts || {}) // this tab shows the new wording at once
      ok(pick('সংরক্ষণ হয়েছে। সাইটে এখনই নতুন লেখা দেখা যাবে।', 'Saved. The site shows the new wording now.'))
    } catch (e) {
      bad(`${pick('সংরক্ষণ হয়নি: ', 'Not saved: ')}${Object.values(e.fields || {})[0] || errText(e)}`)
    } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title={pick('ওয়েবসাইটের লেখা', 'Website texts')}
        desc={pick('সাইটে যা লেখা আছে, তা এখান থেকে বদলান। কোনো কোড লাগবে না।', 'Change the wording of the site here. No code needed.')} />
      <ol className="stx-how">
        <li>{pick('উপরের বোতাম থেকে সাইটের অংশ বাছুন (যেমন “হোম পেজ”), অথবা যে লেখা বদলাতে চান তার কয়েকটি শব্দ খোঁজার ঘরে লিখুন।', 'Pick a part of the site from the buttons (such as “Home page”), or type a few words of the text you want to change into the search box.')}</li>
        <li>{pick('প্রতিটি কার্ডে লেখা আছে লেখাটি সাইটের কোথায় দেখায় এবং সেটি কী (শিরোনাম, বোতাম, বার্তা…)। ঘরে এখনকার লেখাই আছে; সেখানেই বদলান।', 'Each card says where the text appears and what it is (a heading, a button, a message…). The box holds the current wording; change it right there.')}</li>
        <li>{pick('নিচের “সংরক্ষণ করুন” চাপুন। ভুল হলে “আগের লেখায় ফেরান” চাপলেই আসল লেখা ফিরে আসে।', 'Press “Save” at the bottom. If you make a mistake, “Use the original” brings the original wording back.')}</li>
      </ol>
      <Notice notice={notice} onClose={clear} />
      <Data q={res}>
        {() => saved && (
          <div className="stx">
            <div className="stx-tools">
              <SearchBox value={q} onChange={setQ} placeholder={pick('লেখা খুঁজুন (বাংলা বা English)…', 'Search the texts (Bangla or English)…')} label={pick('লেখা খুঁজুন', 'Search the texts')} />
              <label className="check"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> {pick(`শুধু বদলানো লেখা (${n(changedCount)})`, `Only changed texts (${changedCount})`)}</label>
            </div>
            {!q && !onlyChanged && (
              <div className="chips" role="group" aria-label={pick('সাইটের অংশ', 'Part of the site')}>
                {[...GROUPS, ['other', 'অন্যান্য', 'Other']].map(([id, bn, en]) => (
                  <button key={id} type="button" className={`chip ${group === id ? 'on' : ''}`} aria-pressed={group === id} onClick={() => setGroup(id)}>{pick(bn, en)}</button>
                ))}
              </div>
            )}
            <p className="muted small">{pick(`${n(list.length)}টি লেখা`, `${list.length} texts`)}</p>
            <ul className="stx-list">
              {list.slice(0, shown).map((k) => {
                const v = draft[k] || {}
                const changed = !!clean({ [k]: v })[k]
                const d = describe(k)
                const marks = marksIn(`${strings.bn[k] || ''} ${strings.en[k] || ''}`)
                return (
                  <li key={k} data-text={k} className={`stx-row si-card${changed ? ' is-changed' : ''}`}>
                    <div className="stx-head">
                      <div className="stx-what">
                        <strong>{pick(...d.what)}</strong>
                        <span className="stx-where"><Icon name="globe" size={13} /> {pick(...d.where)}{d.to && <> · <Link to={d.to}>{pick('পাতাটি দেখুন', 'See the page')}</Link></>}</span>
                      </div>
                      {changed && <span className="badge badge-ok">{pick('বদলানো', 'Changed')}</span>}
                      {(changed || v.bn !== undefined || v.en !== undefined) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => reset(k)}>{pick('আগের লেখায় ফেরান', 'Use the original')}</button>}
                    </div>
                    <div className="stx-pair">
                      <Box label="বাংলা" lang="bn" raw={v.bn} original={strings.bn[k] || ''} onChange={(x) => set(k, 'bn', x)} />
                      <Box label="English" lang="en" raw={v.en} original={strings.en[k] || ''} onChange={(x) => set(k, 'en', x)} />
                    </div>
                    {marks.length > 0 && <p className="stx-marks">{pick(`লেখার ${marks.join(', ')} অংশটি মুছবেন না — সেখানে সাইট নিজে সংখ্যা বা নাম বসায়।`, `Keep ${marks.join(', ')} in the text — the site puts a number or a name there.`)}</p>}
                  </li>
                )
              })}
            </ul>
            {list.length > shown && <button type="button" className="btn btn-outline btn-sm" onClick={() => setShown(shown + PAGE)}>{pick('আরও দেখুন', 'Show more')}</button>}
            <div className="si-foot">
              <button type="button" className="btn btn-dark" disabled={busy || !dirty} onClick={save}>{busy ? pick('সংরক্ষণ হচ্ছে…', 'Saving…') : pick('সংরক্ষণ করুন', 'Save')}</button>
              {dirty && <small className="muted">{pick('পরিবর্তন এখনো সংরক্ষণ হয়নি।', 'Your changes are not saved yet.')}</small>}
            </div>
          </div>
        )}
      </Data>
    </>
  )
}
