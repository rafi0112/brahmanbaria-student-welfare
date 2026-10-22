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
  const [state, setState] = useState({ data: null, loading: !!path, error: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: null }); return undefined }
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    api(path)
      .then((data) => live && setState({ data, loading: false, error: null }))
      .catch((error) => live && setState({ data: null, loading: false, error }))
    return () => { live = false }
  }, [path, tick])
  const retry = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, retry }
}

export const qs = (obj) => {
  const p = new URLSearchParams()
  Object.entries(obj).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v) })
  const s = p.toString()
  return s ? `?${s}` : ''
}
