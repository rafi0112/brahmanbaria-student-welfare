// Pure helpers for Supabase Auth errors, kept free of React and the SDK so they can be unit tested.

// Maps a Supabase AuthError to the HTTP-like status the UI already understands.
export function authStatus(error) {
  const code = error?.code || ''
  const msg = String(error?.message || '').toLowerCase()
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) return 403
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || error?.status === 429) return 429
  if (code === 'weak_password') return 422
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 401
  if (error?.status >= 500) return 500
  return 400
}

export function toApiError(error) {
  return Object.assign(new Error(error?.code || error?.message || 'auth_error'), { status: authStatus(error), code: error?.code })
}

// Supabase reports a failed email/recovery link in the URL fragment or query string,
// e.g. #error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
export function readUrlAuthError(search = '', hash = '') {
  const p = new URLSearchParams(`${String(hash).replace(/^#/, '')}&${String(search).replace(/^\?/, '')}`)
  const code = p.get('error_code') || p.get('error')
  return code ? { code, description: p.get('error_description') || '' } : null
}
