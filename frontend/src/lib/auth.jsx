import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'

const Ctx = createContext(null)

// Session state comes from the server cookie; the browser never sees the token.
export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, profile: null, loading: true })

  const refresh = useCallback(async () => {
    try {
      const d = await api('/auth/me')
      setState({ user: d.user, profile: d.profile, loading: false })
    } catch {
      setState({ user: null, profile: null, loading: false })
    }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const value = useMemo(() => ({
    ...state,
    refresh,
    set: (d) => setState({ user: d.user, profile: d.profile, loading: false }),
    async logout() {
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
