// The admin's real destinations. The sidebar, the quick-search palette and the favorites star all read this one list.
export const NAV = [
  { id: 'dash', to: '/admin', icon: 'dashboard', label: 'admin.nav.dash', group: 'top' },
  { id: 'activity', to: '/admin/activity', icon: 'activity', label: 'ad.nav.activity', group: 'top' },
  { id: 'students', to: '/admin/students', icon: 'users', label: 'admin.nav.students', group: 'community' },
  { id: 'committee', to: '/admin?tab=committee', icon: 'committee', label: 'admin.tab.committee', group: 'community' },
  { id: 'roles', to: '/admin?tab=roles', icon: 'shield', label: 'admin.tab.roles', group: 'community' },
  { id: 'blog', to: '/admin/blog', icon: 'blog', label: 'admin.nav.blog', group: 'content' },
  { id: 'heritage', to: '/admin/heritage', icon: 'landmark', label: 'admin.nav.places', group: 'content' },
  { id: 'gallery', to: '/admin/gallery', icon: 'gallery', label: 'admin.nav.gallery', group: 'content' },
]

export const GROUPS = [
  { id: 'community', label: 'ad.nav.g.community' },
  { id: 'content', label: 'ad.nav.g.content' },
]

// Which NAV item a location belongs to (a record editor belongs to its list).
export function navFor(pathname, search = '') {
  if (pathname === '/admin') {
    const tab = new URLSearchParams(search).get('tab')
    return NAV.find((n) => n.id === (tab === 'roles' ? 'roles' : tab === 'committee' ? 'committee' : 'dash'))
  }
  return NAV.find((n) => !n.to.includes('?') && n.to !== '/admin' && (pathname === n.to || pathname.startsWith(`${n.to}/`)))
}

// Query parameters that describe the view itself (page and page size do not).
export function viewSummary(search) {
  const p = new URLSearchParams(search)
  return [...p.entries()].filter(([k, v]) => v && !['tab', 'page', 'limit', 'sort'].includes(k)).map(([, v]) => v)
}
