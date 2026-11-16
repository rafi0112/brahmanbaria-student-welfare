// The organization's official Facebook Page. It comes from the build configuration (VITE_FACEBOOK_PAGE_URL), not from the
// code, and only an https address on Facebook's own domains is accepted.
export function facebookPageUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim())
    const host = u.hostname.toLowerCase()
    const ok = u.protocol === 'https:' && (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com' || host === 'www.fb.com' || host === 'fb.me') && !u.username && !u.password
    return ok ? u.toString() : ''
  } catch { return '' }
}

export const FACEBOOK_PAGE_URL = facebookPageUrl(import.meta.env?.VITE_FACEBOOK_PAGE_URL)
