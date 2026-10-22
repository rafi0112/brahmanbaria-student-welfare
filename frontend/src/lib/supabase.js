import { createClient } from '@supabase/supabase-js'
import { readUrlAuthError } from './authErrors.js'

const url = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '')
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

// Captured before the client starts: it removes the auth fragment from the address bar while processing it,
// and an expired or reused email link only shows up there.
export const urlAuthError = typeof window === 'undefined' ? null : readUrlAuthError(window.location.search, window.location.hash)

export const supabaseConfigured = Boolean(url && key)
export const supabase = supabaseConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

// Google sign-in stays hidden until the provider is configured (separate step).
export const googleEnabled = supabaseConfigured && import.meta.env.VITE_ENABLE_GOOGLE === 'true'
