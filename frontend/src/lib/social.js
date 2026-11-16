// The organization's official Facebook Page. VITE_FACEBOOK_PAGE_URL may override it at build time; only an https address on
// Facebook's own domains is ever accepted.
export function facebookPageUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim())
    const host = u.hostname.toLowerCase()
    const ok = u.protocol === 'https:' && (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com' || host === 'www.fb.com' || host === 'fb.me') && !u.username && !u.password
    return ok ? u.toString() : ''
  } catch { return '' }
}

export const OFFICIAL_FACEBOOK_PAGE = 'https://www.facebook.com/share/1QSHxFFB47/?mibextid=wwXIfr'
export const FACEBOOK_PAGE_URL = facebookPageUrl(import.meta.env?.VITE_FACEBOOK_PAGE_URL) || OFFICIAL_FACEBOOK_PAGE
