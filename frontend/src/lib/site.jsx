import { useEffect, useState } from 'react'
import { api } from './api.js'

// The pictures admins chose for the public site (home slides, the picture at the top of each page, the gallery's
// featured picture, the Explore section). Fetched once per visit and shared; until it arrives, and wherever nothing was
// chosen, pages show their built-in picture.
const EMPTY = { hero: [], pages: {}, galleryFeatured: '', explore: '', ready: false }
let cache = null
let pending = null
const listeners = new Set()

function load() {
  if (!pending) {
    pending = api('/site-images')
      .then((d) => { cache = { hero: d.hero || [], pages: d.pages || {}, galleryFeatured: d.galleryFeatured || '', explore: d.explore || '', ready: true } })
      .catch(() => { cache = { ...EMPTY, ready: true } })
      .then(() => listeners.forEach((f) => f(cache)))
  }
  return pending
}

export function useSiteImages() {
  const [v, setV] = useState(cache || EMPTY)
  useEffect(() => {
    if (cache) { setV(cache); return undefined }
    listeners.add(setV)
    load()
    return () => listeners.delete(setV)
  }, [])
  return v
}

// After an admin saves new pictures, the next public page picks them up without a reload.
export function forgetSiteImages() { cache = null; pending = null }

const SITE = {
  bn: 'ব্রাহ্মণবাড়িয়া জেলা ছাত্রকল্যাণ পরিষদ, জগন্নাথ বিশ্ববিদ্যালয়',
  en: 'BSWA · Brahmanbaria Student’s Welfare Association, Jagannath University',
}

// The browser tab (and what search engines read once the page has rendered): "Page · Association".
export function usePageTitle(title, lang = 'bn') {
  useEffect(() => {
    const short = lang === 'en' ? 'BSWA, Jagannath University' : 'ব্রাহ্মণবাড়িয়া জেলা ছাত্রকল্যাণ পরিষদ'
    document.title = title ? `${title} · ${short}` : SITE[lang] || SITE.bn
  }, [title, lang])
}
