import { createClient } from '@supabase/supabase-js'
import { readUrlAuthError } from './authErrors.js'

const url = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '')
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

// Captured before the client starts: it removes the auth fragment from the address bar while processing it,
// and an expired or reused email link only shows up there.
export const urlAuthError = typeof window === 'undefined' ? null : readUrlAuthError(window.location.search, window.location.hash)

// True when this page load came from an emailed confirmation link (the session is in the fragment, or a code in the query).
// Captured before the client starts, for the same reason. Without it, an old session in this browser would look like a
// freshly confirmed address.
export const arrivedByEmailLink = typeof window === 'undefined' ? false : /(^|[#&])access_token=/.test(window.location.hash) || new URLSearchParams(window.location.search).has('code')

export const supabaseConfigured = Boolean(url && key)
export const supabase = supabaseConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

// Google sign-in stays hidden until the provider is configured (separate step).
export const googleEnabled = supabaseConfigured && import.meta.env.VITE_ENABLE_GOOGLE === 'true'
