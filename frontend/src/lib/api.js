import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const BASE = import.meta.env.VITE_API_BASE || ''

export async function api(path, opts) {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  const headers = { ...(opts?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(opts?.headers || {}) }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  const res = await fetch(`${BASE}/api/v1${path}`, { credentials: 'include', ...opts, headers })
  let body = null
  try { body = await res.json() } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(body?.error || `HTTP ${res.status}`)
    err.status = res.status
    err.fields = body?.fields
    throw err
  }
  return body
}

// Fetch with loading / error / retry. `path` null skips the request.
export function useApi(path) {
  // `at` remembers which path the state belongs to, so the render right after the path changes
  // reports "loading" instead of showing the previous (or empty) result
  const [state, setState] = useState({ at: path, data: null, loading: !!path, error: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) { setState({ at: path, data: null, loading: false, error: null }); return undefined }
    let live = true
    setState((s) => ({ ...s, at: path, loading: true, error: null }))
    api(path)
      .then((data) => live && setState({ at: path, data, loading: false, error: null }))
      .catch((error) => live && setState({ at: path, data: null, loading: false, error }))
    return () => { live = false }
  }, [path, tick])
  const retry = useCallback(() => setTick((t) => t + 1), [])
  const fresh = state.at === path
  return { data: fresh ? state.data : null, loading: path ? !fresh || state.loading : false, error: fresh ? state.error : null, retry }
}

export const qs = (obj) => {
  const p = new URLSearchParams()
  Object.entries(obj).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v) })
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function bearer() {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

// Uploads one picture (a File, or a Google Drive link) to the admin media endpoint with real progress events.
// Resolves with { path, url } only when the server confirms the file is stored; rejects with the server's error code.
export async function uploadMedia({ file, driveUrl, endpoint = '/admin/media', onProgress, signal }) {
  const form = new FormData()
  if (file) form.append('file', file)
  if (driveUrl) form.append('imageUrl', driveUrl)
  const headers = await bearer()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/api/v1${endpoint}`)
    xhr.withCredentials = true
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onerror = () => reject(Object.assign(new Error('network'), { status: 0 }))
    xhr.onabort = () => reject(Object.assign(new Error('aborted'), { status: 0 }))
    xhr.onload = () => {
      let body = null
      try { body = JSON.parse(xhr.responseText) } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body?.path) resolve(body)
      else reject(Object.assign(new Error(body?.error || `HTTP ${xhr.status}`), { status: xhr.status }))
    }
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(form)
  })
}

// Downloads a protected file (for example the members CSV) with the admin's token.
export async function downloadFile(path, filename) {
  const res = await fetch(`${BASE}/api/v1${path}`, { credentials: 'include', headers: await bearer() })
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Profile photos are private (the API checks who is asking), so they are fetched with the viewer's token and shown
// through an object URL. Results are cached per URL; the URL changes whenever the photo changes.
const photoCache = new Map()
export function loadPhoto(url) {
  if (!url) return Promise.resolve(null)
  if (!photoCache.has(url)) {
    photoCache.set(url, (async () => {
      const res = await fetch(`${BASE}${url}`, { credentials: 'include', headers: await bearer() })
      if (!res.ok) return null
      return URL.createObjectURL(await res.blob())
    })().catch(() => null))
  }
  return photoCache.get(url)
}

export function usePhoto(url) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let live = true
    setSrc(null)
    loadPhoto(url).then((s) => { if (live) setSrc(s) })
    return () => { live = false }
  }, [url])
  return src
}

// Sends one photo to the member's own endpoint or the admin endpoint; resolves with the JSON the API returns.
export async function sendPhoto(path, file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/api/v1${path}`, { method: 'POST', credentials: 'include', headers: await bearer(), body: form })
  let body = null
  try { body = await res.json() } catch { /* empty */ }
  if (!res.ok) throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { status: res.status })
  return body
}
