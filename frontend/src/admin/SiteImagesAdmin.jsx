import { useEffect, useRef, useState } from 'react'
import { api, useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { forgetSiteImages } from '../lib/site.jsx'
import { Data } from '../components/ui.jsx'
import { builtInSlides } from '../data/heroSlides.js'
import { ImagePicker, Modal, Notice, PageHeader, useErrText, useNotice } from './kit.jsx'
import GalleryChooser from './GalleryChooser.jsx'
import Icon from './icons.jsx'
import VideoPicker from './VideoPicker.jsx'
import { youtubeThumb } from '../lib/video.js'

// The pictures of the public site that admins choose: the home page slides (order, published or not), the picture at
// the top of each page, the Gallery page's featured picture and the "Explore Brahmanbaria" picture. A picture comes
// from this device, from a link, or from the gallery. Every change is saved at once; the Save button is there for typed captions.

const PAGES = [
  ['students', 'শিক্ষার্থী', 'Students'], ['alumni', 'অ্যালামনাই', 'Alumni'], ['committee', 'কমিটি', 'Committee'], ['events', 'ইভেন্ট', 'Events'],
  ['gallery', 'গ্যালারি', 'Gallery'], ['heritage', 'ঐতিহ্য', 'Heritage'], ['blog', 'ব্লগ', 'Blog'], ['about', 'আমাদের সম্পর্কে', 'About'],
  ['help', 'যোগাযোগ', 'Contact'], ['directory', 'উপজেলা ডিরেক্টরি', 'Upazila directory'], ['member', 'সদস্যপদ', 'Membership'],
]

// pictures inside a page (not at its top)
const INNER = [
  ['about-art-1', 'আমাদের সম্পর্কে: লেখার পাশের প্রথম ছবি', 'About: first picture beside the text'],
  ['about-art-2', 'আমাদের সম্পর্কে: লেখার পাশের দ্বিতীয় ছবি', 'About: second picture beside the text'],
  ['home-community', 'হোম: “যারা গড়ছে আগামী” অংশের ছবি', 'Home: “The people shaping tomorrow” picture'],
  ['profile-cover', 'শিক্ষার্থীর প্রোফাইল পাতার উপরের ছবি', 'Picture at the top of a student’s profile page'],
  ['profile-side', 'শিক্ষার্থীর প্রোফাইল পাতা: তথ্যের পাশের ছবি', 'Student profile page: picture beside the details'],
  ['heritage-discover-1', 'ঐতিহ্য পাতা: “ঐতিহ্য ও নিদর্শন” কার্ড', 'Heritage page: “Heritage & Landmarks” card'],
  ['heritage-discover-2', 'ঐতিহ্য পাতা: “ইসলামী সংস্কৃতি ও ঐতিহ্য” কার্ড', 'Heritage page: “Islamic Culture & Traditions” card'],
  ['heritage-discover-3', 'ঐতিহ্য পাতা: “নদী ও প্রকৃতি” কার্ড', 'Heritage page: “Rivers & Nature” card'],
  ['heritage-culture-1', 'ঐতিহ্য পাতা: “ইসলামী ঐতিহ্য” ছবি', 'Heritage page: “Islamic Heritage” picture'],
  ['heritage-culture-2', 'ঐতিহ্য পাতা: “বাউল ও লোকসংস্কৃতি” ছবি', 'Heritage page: “Baul & Folk Culture” picture'],
  ['heritage-culture-3', 'ঐতিহ্য পাতা: “পুতুল নাচ” ছবি', 'Heritage page: “Putul Nach” picture'],
  ['heritage-culture-4', 'ঐতিহ্য পাতা: “নদী ও প্রকৃতি” ছবি', 'Heritage page: “Rivers & Nature” picture'],
]

// the logo and the pencil sketches drawn behind some sections (each sketch may appear in more than one place)
const LOOK = [
  ['logo', 'লোগো (উপরের মেনু, ফুটার, লগইন পাতা)', 'Logo (top menu, footer, sign-in pages)', 'বর্গাকার ও স্বচ্ছ পটভূমির PNG সবচেয়ে ভালো।', 'A square PNG with a transparent background works best.'],
  ['sketch-river', 'নদীর স্কেচ (হোম “ঘুরে দেখুন” অংশ ও ফুটার)', 'River sketch (Home “Explore” section and footer)', 'হালকা পেনসিল-স্কেচ, স্বচ্ছ বা সাদা পটভূমি।', 'A light pencil sketch on a transparent or white background.'],
  ['sketch-heritage', 'স্থাপনার স্কেচ (হোম “যারা গড়ছে আগামী” ও ফুটার)', 'Building sketch (Home “The people shaping tomorrow” and footer)', '', ''],
  ['sketch-students', 'শিক্ষার্থীদের স্কেচ (হোম “যারা গড়ছে আগামী”)', 'Students sketch (Home “The people shaping tomorrow”)', '', ''],
  ['sketch-vine-tl', 'লতার স্কেচ (ফুটারের কোণে)', 'Vine sketch (footer corner)', '', ''],
]

const legacyUrl = (ref) => (ref && !/\.(jpg|png)$/.test(ref) ? `/images/${ref}-640.webp` : undefined)
const thumbOf = (x) => x?.imageUrl || legacyUrl(x?.image) || (x?.youtube ? youtubeThumb(x.youtube, 'mqdefault') : '')

// One picture slot: upload, link or "choose from the gallery" (all in ImagePicker).
function Slot({ label, hint, value, onChange }) {
  return (
    <div className="si-slot">
      <ImagePicker profile="hero" label={label} value={value?.image || ''} url={value?.imageUrl} legacyUrl={legacyUrl(value?.image)} hint={hint}
        onChange={(m) => onChange(m ? { image: m.path, imageUrl: m.url } : null)} />
    </div>
  )
}

export default function SiteImagesAdmin() {
  const { pick, n } = useApp()
  const errText = useErrText()
  const res = useApi('/admin/settings/site-images')
  const { notice, ok, bad, clear } = useNotice()
  const [v, setV] = useState(null)
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [fresh, setFresh] = useState(null) // a new slide's picture from upload or link, before it joins the list

  const take = (d) => {
    // until an admin has saved a list of their own, the site shows its built-in slides, so the panel starts from those
    const next = { hero: d.hero?.length ? d.hero : builtInSlides(), pages: d.pages || {}, galleryFeatured: d.galleryFeatured || null, explore: d.explore || null }
    setV(next); setSaved(JSON.stringify(next))
  }
  useEffect(() => { if (res.data) take(res.data) }, [res.data])
  const dirty = v && JSON.stringify(v) !== saved
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Every choice (a picture picked, uploaded or removed; a slide published, moved or deleted) is saved at once, so the site
  // shows it without another step. Saves run one after another; the last state always wins. Typing a caption is saved when
  // the field is left (or with the Save button).
  const pending = useRef(null)
  const running = useRef(false)
  const toBody = (x) => ({
    hero: x.hero.map(({ id, image, video, youtube, captionBn, captionEn, published }) => ({ id, image: image || '', video: video || '', youtube: youtube || '', captionBn, captionEn, published })),
    pages: Object.fromEntries(Object.entries(x.pages).filter(([, y]) => y?.image).map(([k, y]) => [k, y.image])),
    galleryFeatured: x.galleryFeatured?.image || '', explore: x.explore?.image || '',
  })
  const persist = async (next) => {
    pending.current = next
    if (running.current) return
    running.current = true
    setBusy(true); clear()
    let last = null
    try {
      while (pending.current) {
        const cur = pending.current
        pending.current = null
        last = await api('/admin/settings/site-images', { method: 'PUT', body: JSON.stringify(toBody(cur)) })
        forgetSiteImages()
      }
      take(last)
      ok(pick('সংরক্ষণ হয়েছে। সাইটে এখনই দেখা যাবে।', 'Saved. The site shows it now.'))
    } catch (e) {
      pending.current = null
      bad(`${pick('সংরক্ষণ হয়নি: ', 'Not saved: ')}${Object.values(e.fields || {})[0] || errText(e)}`)
    } finally { running.current = false; setBusy(false) }
  }
  const commit = (next) => { setV(next); persist(next) }
  const save = () => persist(v)
  const slide = (i, patch) => setV({ ...v, hero: v.hero.map((h, k) => (k === i ? { ...h, ...patch } : h)) })
  const slideNow = (i, patch) => commit({ ...v, hero: v.hero.map((h, k) => (k === i ? { ...h, ...patch } : h)) })
  const move = (i, by) => {
    const hero = [...v.hero]
    const j = i + by
    if (j < 0 || j >= hero.length) return
    ;[hero[i], hero[j]] = [hero[j], hero[i]]
    commit({ ...v, hero })
  }
  // put slide i at position pos (1 = shown first); the others keep their order
  const moveTo = (i, pos) => {
    const hero = [...v.hero]
    const [h] = hero.splice(i, 1)
    hero.splice(pos - 1, 0, h)
    commit({ ...v, hero })
  }
  const slideOf = (g) => ({ id: '', image: g.image || '', imageUrl: g.imageUrl || '', video: g.video || '', videoUrl: g.videoUrl || '', youtube: g.youtube || '', captionBn: g.captionBn || '', captionEn: g.captionEn || '', published: true })
  const addSlides = (list) => {
    const room = 12 - v.hero.length
    if (room <= 0 || list.length > room) bad(pick('সর্বোচ্চ ১২টি স্লাইড রাখা যায়।', 'At most 12 slides.'))
    if (room > 0) commit({ ...v, hero: [...v.hero, ...list.slice(0, room).map(slideOf)] })
  }
  const addSlide = (g) => addSlides([g])
  const live = v ? v.hero.filter((h) => h.published).length : 0

  return (
    <>
      <PageHeader title={pick('সাইটের ছবি', 'Site pictures')} desc={pick('হোম পেজের স্লাইড, প্রতিটি পাতার উপরের ছবি, গ্যালারির ফিচার্ড ছবি ও “ঘুরে দেখুন ব্রাহ্মণবাড়িয়া” অংশের ছবি এখান থেকে বদলান। ছবি ডিভাইস থেকে আপলোড করুন, লিংক দিন, অথবা গ্যালারি থেকে বেছে নিন।', 'Change the home page slides, the picture at the top of each page, the gallery’s featured picture and the “Explore Brahmanbaria” picture. Upload from this device, paste a link, or choose from the gallery.')}
        action={<button type="button" className="btn btn-dark btn-sm" disabled={busy || !dirty} onClick={save}>{busy ? pick('সংরক্ষণ হচ্ছে…', 'Saving…') : pick('সংরক্ষণ করুন', 'Save')}</button>} />
      <Notice notice={notice} onClose={clear} />
      <Data q={res}>
        {() => v && (
          <div className="si">
            <section className="si-card" aria-labelledby="si-hero">
              <h2 id="si-hero">{pick('হোম পেজের স্লাইড', 'Home page slides')}</h2>
              <p className="muted small">{live > 0
                ? pick(`এখন ${n(live)}টি স্লাইড প্রকাশিত। উপরের স্লাইডটি প্রথমে দেখায়; তীর বা নম্বর দিয়ে ক্রম বদলান। সব স্লাইড মুছলে তিনটি ডিফল্ট ছবি ফিরে আসে।`, `${live} slide${live === 1 ? ' is' : 's are'} published. The top slide shows first; use the arrows or the number to change the order. Delete every slide and the three built-in pictures come back.`)
                : pick('কোনো স্লাইড প্রকাশিত নেই, তাই সাইট এখন তিনটি ডিফল্ট ছবি দেখাচ্ছে। একটি স্লাইড প্রকাশ করলে শুধু প্রকাশিত স্লাইডগুলোই দেখাবে।', 'No slide is published, so the site shows its three built-in pictures. Publish a slide and the site shows only the published ones.')}</p>
              {v.hero.length > 0 && (
                <ol className="si-slides">
                  {v.hero.map((h, i) => (
                    <li key={h.id || `new-${i}`} className={h.published ? '' : 'is-off'}>
                      <label className="si-pos"><span>{pick('নম্বর', 'Number')}</span>
                        <select value={i + 1} onChange={(e) => moveTo(i, Number(e.target.value))} aria-label={pick('এই ছবি কত নম্বরে দেখাবে', 'At which number this picture shows')}>
                          {v.hero.map((_, k) => <option key={k} value={k + 1}>{n(k + 1)}</option>)}
                        </select></label>
                      <span className="si-thumb">
                        {thumbOf(h) ? <img src={thumbOf(h)} alt="" /> : h.videoUrl ? <video src={`${h.videoUrl}#t=0.5`} muted playsInline preload="metadata" /> : <img alt="" />}
                        {(h.video || h.youtube) && <b className="si-kind">{h.youtube ? 'YouTube' : pick('ভিডিও', 'Video')}</b>}
                      </span>
                      <div className="si-cap">
                        <label><span>{pick('ক্যাপশন (বাংলা)', 'Caption (Bangla)')}</span><input value={h.captionBn} maxLength={120} onChange={(e) => slide(i, { captionBn: e.target.value })} onBlur={() => dirty && persist(v)} placeholder="নৌকাবাইচ · আমাদের ঐতিহ্য" /></label>
                        <label><span>{pick('ক্যাপশন (ইংরেজি)', 'Caption (English)')}</span><input value={h.captionEn} maxLength={120} onChange={(e) => slide(i, { captionEn: e.target.value })} onBlur={() => dirty && persist(v)} placeholder="Boat race · Our heritage" /></label>
                      </div>
                      <div className="si-acts">
                        <span className={`si-state ${h.published ? 'is-on' : ''}`}>{h.published ? pick('প্রকাশিত', 'Published') : pick('অপ্রকাশিত', 'Unpublished')}</span>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => slideNow(i, { published: !h.published })}>{h.published ? pick('আনপাবলিশ', 'Unpublish') : pick('পাবলিশ', 'Publish')}</button>
                        <button type="button" className="ad-iconbtn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={pick('উপরে নিন', 'Move up')}><Icon name="up" size={16} /></button>
                        <button type="button" className="ad-iconbtn" disabled={i === v.hero.length - 1} onClick={() => move(i, 1)} aria-label={pick('নিচে নিন', 'Move down')}><Icon name="down" size={16} /></button>
                        <button type="button" className="ad-iconbtn is-danger" onClick={() => commit({ ...v, hero: v.hero.filter((_, k) => k !== i) })} aria-label={pick('স্লাইড মুছুন', 'Delete slide')}><Icon name="trash" size={16} /></button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <div className="si-add">
                <h3>{pick('নতুন স্লাইড যোগ করুন', 'Add a slide')}</h3>
                <p className="muted small">{pick('চওড়া (ল্যান্ডস্কেপ) ছবি সবচেয়ে ভালো দেখায়, অন্তত ১৬০০ পিক্সেল চওড়া।', 'A wide (landscape) picture looks best, at least 1600 pixels wide.')}</p>
                <div className="si-slot">
                  <ImagePicker profile="hero" label={pick('ছবি', 'Picture')} value={fresh?.image || ''} url={fresh?.imageUrl}
                    gallery={false} onChange={(m) => { if (m) { addSlide({ image: m.path, imageUrl: m.url }); setFresh(null) } }} />
                  <button type="button" className="btn btn-outline btn-sm si-from" onClick={() => setAdding(true)}><Icon name="gallery" size={15} /> {pick('গ্যালারি থেকে এক বা একাধিক ছবি বাছুন', 'Choose one or more from the gallery')}</button>
                </div>
                {adding && <GalleryChooser multiple max={Math.max(1, 12 - v.hero.length)} onClose={() => setAdding(false)} onPick={(list) => { addSlides(list); setAdding(false) }} />}
                <div className="si-video">
                  <h3>{pick('অথবা একটি ভিডিও', 'Or a video')}</h3>
                  <p className="muted small">{pick('ভিডিও স্লাইড পুরো স্ক্রিন জুড়ে, ছবির মতো একই ফ্রেমে, শব্দ ছাড়া চলে। আপলোড করা ভিডিও শেষ পর্যন্ত (সর্বোচ্চ ১ মিনিট) আর YouTube ভিডিও ২০ সেকেন্ড দেখিয়ে পরের স্লাইডে যায়।', 'A video slide fills the same frame as a picture and plays without sound. An uploaded video plays to its end (at most a minute); a YouTube video shows for 20 seconds, then the next slide comes.')}</p>
                  <VideoPicker onPick={(x) => addSlide(x)} />
                </div>
              </div>
            </section>

            <section className="si-card" aria-labelledby="si-feat">
              <h2 id="si-feat">{pick('গ্যালারির ফিচার্ড ছবি ও “ঘুরে দেখুন” অংশ', 'Gallery featured picture and the “Explore” section')}</h2>
              <div className="si-grid">
                <Slot label={pick('গ্যালারি পাতার ফিচার্ড ছবি', 'Featured picture of the Gallery page')} value={v.galleryFeatured} onChange={(x) => commit({ ...v, galleryFeatured: x })}
                  hint={pick('গ্যালারি পাতার শুরুতে বড় করে দেখানো হয়। খালি রাখলে ফিচার্ড অংশ দেখায় না।', 'Shown large at the start of the Gallery page. Leave empty to show no featured picture.')} />
                <Slot label={pick('হোম পেজের “ঘুরে দেখুন ব্রাহ্মণবাড়িয়া” ছবি', 'Home page “Explore Brahmanbaria” picture')} value={v.explore} onChange={(x) => commit({ ...v, explore: x })}
                  hint={pick('খালি রাখলে সাইটের ডিফল্ট ছবি দেখায়।', 'Leave empty to show the built-in picture.')} />
              </div>
            </section>

            <section className="si-card" aria-labelledby="si-pages">
              <h2 id="si-pages">{pick('প্রতিটি পাতার উপরের ছবি', 'Picture at the top of each page')}</h2>
              <p className="muted small">{pick('যে পাতার ছবি বদলাবেন শুধু সেটিতে ছবি দিন। খালি থাকলে সেই পাতা ডিফল্ট ছবি দেখায়।', 'Set a picture only for the pages you want to change. A page left empty shows its built-in picture.')}</p>
              <div className="si-grid">
                {PAGES.map(([key, bn, en]) => (
                  <Slot key={key} label={pick(bn, en)} value={v.pages[key]} onChange={(x) => commit({ ...v, pages: { ...v.pages, [key]: x } })} />
                ))}
              </div>
            </section>

            <section className="si-card" aria-labelledby="si-inner">
              <h2 id="si-inner">{pick('পাতার ভেতরের ছবি', 'Pictures inside the pages')}</h2>
              <p className="muted small">{pick('খালি থাকলে সাইটের ডিফল্ট ছবি দেখায়।', 'Leave empty to show the built-in picture.')}</p>
              <div className="si-grid">
                {INNER.map(([key, bn, en]) => (
                  <Slot key={key} label={pick(bn, en)} value={v.pages[key]} onChange={(x) => commit({ ...v, pages: { ...v.pages, [key]: x } })} />
                ))}
              </div>
            </section>

            <section className="si-card" aria-labelledby="si-look">
              <h2 id="si-look">{pick('লোগো ও স্কেচ', 'Logo and sketches')}</h2>
              <p className="muted small">{pick('খালি থাকলে সাইটের নিজের লোগো ও স্কেচ দেখায়। ব্রাউজারের ট্যাবের ছোট আইকন ও ইমেইলের লোগো এখান থেকে বদলায় না।', 'Empty means the site’s own logo and sketches. The small browser-tab icon and the logo in emails do not change from here.')}</p>
              <div className="si-grid">
                {LOOK.map(([key, bn, en, hb, he]) => (
                  <Slot key={key} label={pick(bn, en)} hint={hb ? pick(hb, he) : undefined} value={v.pages[key]} onChange={(x) => commit({ ...v, pages: { ...v.pages, [key]: x } })} />
                ))}
              </div>
            </section>

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
