import { useEffect, useMemo, useState } from 'react'
import { api, useApi } from '../lib/api.js'
import { useApp, setSiteTexts } from '../lib/app.jsx'
import { strings } from '../data/strings.js'
import { Data } from '../components/ui.jsx'
import { Notice, PageHeader, SearchBox, useErrText, useNotice } from './kit.jsx'

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

function Box({ label, lang, value, original, onChange }) {
  const rows = Math.min(8, Math.max(1, Math.ceil(Math.max(value.length, original.length) / 60)))
  return (
    <label className="stx-box">
      <span>{label}</span>
      <textarea lang={lang} rows={rows} value={value} placeholder={original} onChange={(e) => onChange(e.target.value)} maxLength={5000} />
    </label>
  )
}

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

  const norm = (m) => JSON.stringify(Object.fromEntries(Object.entries(m).filter(([, v]) => v.bn || v.en).sort(([a], [b]) => a.localeCompare(b))))
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
      if (onlyChanged && !(draft[k]?.bn || draft[k]?.en)) return false
      if (words) {
        const hay = `${k} ${strings.bn[k] || ''} ${strings.en[k] || ''} ${draft[k]?.bn || ''} ${draft[k]?.en || ''}`.toLowerCase()
        return hay.includes(words)
      }
      return onlyChanged || groupOf(k) === group
    })
  }, [q, group, onlyChanged, draft])
  const changedCount = Object.values(draft).filter((v) => v.bn || v.en).length
  const set = (k, lang, value) => setDraft((d) => ({ ...d, [k]: { ...(d[k] || {}), [lang]: value } }))
  const reset = (k) => setDraft((d) => { const x = { ...d }; delete x[k]; return x })

  const save = async () => {
    setBusy(true); clear()
    try {
      const body = Object.fromEntries(Object.entries(draft).filter(([, v]) => (v.bn || '').trim() || (v.en || '').trim()))
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
        desc={pick('সাইটের যেকোনো লেখা এখান থেকে বদলান, কোড ছাড়াই। বাক্স খালি রাখলে আসল লেখা দেখায়। {n}-এর মতো বন্ধনীর চিহ্নগুলো রেখে দিন, সেখানে সংখ্যা বা নাম বসে।',
          'Change any text of the site here, without code. An empty box shows the original wording. Keep marks such as {n} in braces: a number or name goes there.')} />
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
                const changed = !!(v.bn || v.en)
                return (
                  <li key={k} className={`stx-row si-card${changed ? ' is-changed' : ''}`}>
                    <div className="stx-head">
                      <code>{k}</code>
                      {changed && <span className="badge badge-ok">{pick('বদলানো', 'Changed')}</span>}
                      {changed && <button type="button" className="btn btn-ghost btn-sm" onClick={() => reset(k)}>{pick('আসল লেখায় ফেরান', 'Use the original')}</button>}
                    </div>
                    <div className="stx-pair">
                      <Box label="বাংলা" lang="bn" value={v.bn || ''} original={strings.bn[k] || ''} onChange={(x) => set(k, 'bn', x)} />
                      <Box label="English" lang="en" value={v.en || ''} original={strings.en[k] || ''} onChange={(x) => set(k, 'en', x)} />
                    </div>
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
