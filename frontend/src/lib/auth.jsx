import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import { supabase } from './supabase.js'

const Ctx = createContext(null)

// Session state comes from the server cookie; the browser never sees the token.
export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, profile: null, loading: true })

  const refresh = useCallback(async () => {
    try {
      const d = await api('/auth/me')
      let profile = d.profile
      if (!profile && d.user.role !== 'admin' && supabase) {
        // Email confirmation means sign-up returns no session, so the profile is created on first sign-in.
        const md = (await supabase.auth.getSession()).data.session?.user?.user_metadata
        if (md?.name && md?.batch && md?.department && md?.upazila && md?.union) {
          try {
            const r = await api('/me/profile', { method: 'POST', body: JSON.stringify({ name: md.name, batch: Number(md.batch), department: md.department, upazila: md.upazila, union: md.union }) })
            profile = r.profile
          } catch { /* the dashboard offers a form to complete it by hand */ }
        }
      }
      setState({ user: d.user, profile, loading: false })
    } catch {
      setState({ user: null, profile: null, loading: false })
    }
  }, [])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    if (!supabase) return undefined
    const { data } = supabase.auth.onAuthStateChange(() => { setTimeout(refresh, 0) })
    return () => data.subscription.unsubscribe()
  }, [refresh])

  const value = useMemo(() => ({
    ...state,
    refresh,
    set: (d) => setState({ user: d.user, profile: d.profile, loading: false }),
    async logout() {
      if (supabase) await supabase.auth.signOut()
      try { await api('/auth/logout', { method: 'POST' }) } catch { /* cookie may already be gone */ }
      setState({ user: null, profile: null, loading: false })
    },
  }), [state, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

// Maps an API error to a translated, user-facing message key.
export function errorKey(err) {
  if (err.status === 503) return 'auth.unavailable'
  if (err.status === 429) return 'auth.rateLimited'
  if (err.status === 0 || err.name === 'TypeError') return 'state.error'
  return null
}
