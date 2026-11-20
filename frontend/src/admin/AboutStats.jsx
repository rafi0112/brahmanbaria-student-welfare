import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { bnDigits } from '../data/strings.js'

// The four "At a glance" numbers on the About page, in one clear place. Each is counted by the site unless an admin
// types a number; "Count it automatically" clears the typed one. The words under each number can be changed too.
// It edits the same website texts as the list below it (about.stat…N / about.stat…L) and is saved with them.
export const ABOUT_STATS = [
  ['about.statStudentsL', 'about.statStudentsN', (s) => (s ? (s.students || 0) + (s.alumni || 0) : null), 'বর্তমান শিক্ষার্থী + অ্যালামনাই', 'current students + alumni'],
  ['about.statBatchesL', 'about.statBatchesN', (s) => (s ? (s.latestBatch || s.batches) : null), 'এ পর্যন্ত মোট ব্যাচ (সবচেয়ে নতুন ব্যাচের নম্বর, প্রতি বছর নিজে বাড়ে)', 'batches so far (the newest batch number; grows every year)'],
  ['about.statUpazilasL', 'about.statUpazilasN', (s) => s?.upazilas ?? null, 'জেলার উপজেলা', 'upazilas of the district'],
  ['about.statPlacesL', 'about.statPlacesN', (s) => s?.places ?? null, 'প্রকাশিত ঐতিহাসিক স্থান', 'published heritage places'],
]
export const ABOUT_STAT_KEYS = new Set(ABOUT_STATS.flatMap(([l, n]) => [l, n]))

const latin = (s) => String(s || '').replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d))

export default function AboutStats({ draft, set, reset, original }) {
  const { pick, n, lang } = useApp()
  const s = useApi('/stats').data
  return (
    <section className="ab-admin si-card" aria-labelledby="ab-admin-h">
      <h3 id="ab-admin-h">{pick('“আমাদের সম্পর্কে” পাতা: এক নজরে সংখ্যা', 'About page: the numbers “At a glance”')}</h3>
      <p className="muted small">{pick('প্রতিটি সংখ্যা সাইট নিজে গোনে। নিজের সংখ্যা দেখাতে চাইলে ঘরে লিখুন (যেমন ১৩০ বা 130+); “নিজে গোনা হোক” চাপলে আবার গোনা সংখ্যা দেখাবে। নিচের “সংরক্ষণ করুন” চাপুন।',
        'The site counts each number. To show your own, type it in the box (for example 130 or 130+); “Count it automatically” goes back to the counted number. Then press “Save” below.')}</p>
      <div className="ab-admin-grid">
        {ABOUT_STATS.map(([lk, nk, count, whatBn, whatEn]) => {
          const typed = latin(draft[nk]?.en || draft[nk]?.bn || '')
          const auto = count(s)
          const own = typed.trim() !== ''
          const setNumber = (x) => {
            const v = latin(x).replace(/[^\d+,.\s]/g, '').slice(0, 12)
            if (!v.trim()) { reset(nk); return }
            set(nk, 'en', v)
            set(nk, 'bn', bnDigits(v))
          }
          return (
            <div key={nk} className={`ab-admin-row${own ? ' is-own' : ''}`} data-stat={nk}>
              <div className="ab-admin-now">
                <span className="ab-admin-num">{own ? (lang === 'bn' ? bnDigits(typed) : typed) : auto != null ? n(auto) : '–'}</span>
                <small className="muted">{own ? pick('আপনার লেখা সংখ্যা', 'your number') : pick(`নিজে গোনা: ${whatBn}`, `counted: ${whatEn}`)}</small>
              </div>
              <label className="field compact"><span>{pick('নিজের সংখ্যা', 'Your number')}</span>
                <input inputMode="numeric" value={typed} placeholder={auto != null ? String(auto) : ''} onChange={(e) => setNumber(e.target.value)} aria-label={`${pick('নিজের সংখ্যা', 'Your number')}: ${pick(draft[lk]?.bn || original.bn[lk], draft[lk]?.en || original.en[lk])}`} />
              </label>
              {own && <button type="button" className="btn btn-ghost btn-sm" onClick={() => reset(nk)}>{pick('নিজে গোনা হোক', 'Count it automatically')}</button>}
              <div className="ab-admin-names">
                <label className="field compact"><span>{pick('নাম (বাংলা)', 'Name (Bangla)')}</span>
                  <input lang="bn" value={draft[lk]?.bn ?? ''} placeholder={original.bn[lk]} onChange={(e) => set(lk, 'bn', e.target.value)} maxLength={60} /></label>
                <label className="field compact"><span>{pick('নাম (English)', 'Name (English)')}</span>
                  <input lang="en" value={draft[lk]?.en ?? ''} placeholder={original.en[lk]} onChange={(e) => set(lk, 'en', e.target.value)} maxLength={60} /></label>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
