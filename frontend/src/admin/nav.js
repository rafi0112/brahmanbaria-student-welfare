// The admin's real destinations. The sidebar, the quick-search palette and the favorites star all read this one list.
//
// A parent with `children` is a section whose list pages are filtered views. A child names its own query; `watch`
// lists the query keys that decide which child is current (a key that is absent counts as ''), so a child is only
// highlighted when the address really shows that view. Following a child only changes filters, never data.
export const NAV = [
  { id: 'dash', to: '/admin', icon: 'dashboard', label: 'admin.nav.dash', group: 'overview' },
  { id: 'activity', to: '/admin/activity', icon: 'activity', label: 'ad.nav.activity', group: 'overview' },
  { id: 'contact', to: '/admin/contact', icon: 'mail', label: 'ad.nav.contact', group: 'overview', watch: ['status'], children: [
    { id: 'inbox', label: 'ad.ct.inbox', query: {} },
    { id: 'new', label: 'ad.ct.new', query: { status: 'new' } },
    { id: 'replied', label: 'ad.ct.replied', query: { status: 'replied' } },
    { id: 'archived', label: 'ad.ct.archived', query: { status: 'archived' } },
    { id: 'all', label: 'ad.status.allShort', query: { status: 'all' } },
  ] },
  { id: 'students', to: '/admin/students', icon: 'users', label: 'admin.nav.students', group: 'people', watch: ['status', 'complete'], children: [
    { id: 'all', label: 'ad.stu.view.all', query: {} },
    { id: 'pending', label: 'ad.status.pending', query: { status: 'pending' } },
    { id: 'approved', label: 'ad.status.approved', query: { status: 'approved' } },
    { id: 'rejected', label: 'ad.status.rejected', query: { status: 'rejected' } },
    { id: 'incomplete', label: 'ad.stu.view.incomplete', query: { complete: 'no' } },
  ] },
  { id: 'imported', to: '/admin/students?tab=imported', icon: 'directory', label: 'ad.nav.imported', group: 'people', watch: ['status'], children: [
    { id: 'all', label: 'ad.status.allShort', query: {} },
    { id: 'awaiting', label: 'ad.imp.awaiting', query: { status: 'awaiting' } },
    { id: 'verified', label: 'ad.imp.verified', query: { status: 'verified' } },
  ] },
  { id: 'roles', to: '/admin?tab=roles', icon: 'shield', label: 'admin.tab.roles', group: 'people', watch: ['role'], children: [
    { id: 'all', label: 'ad.roles.view.all', query: {} },
    { id: 'admin', label: 'admin.roles.admin', query: { role: 'admin' } },
    { id: 'member', label: 'admin.roles.member', query: { role: 'member' } },
  ] },
  { id: 'committee', to: '/admin?tab=committee', icon: 'committee', label: 'admin.tab.committee', group: 'people' },
  // Blog and gallery share one rule: an empty status is the working set (everything not archived).
  { id: 'blog', to: '/admin/blog', icon: 'blog', label: 'admin.nav.blog', group: 'content', watch: ['status'], children: [
    { id: 'all', label: 'ad.status.allShort', query: { status: 'all' } },
    { id: 'active', label: 'ad.status.activeShort', query: {} },
    { id: 'draft', label: 'ad.status.draft', query: { status: 'draft' } },
    { id: 'published', label: 'ad.status.published', query: { status: 'published' } },
    { id: 'archived', label: 'ad.status.archived', query: { status: 'archived' } },
  ] },
  { id: 'heritage', to: '/admin/heritage', icon: 'landmark', label: 'admin.nav.places', group: 'content', watch: ['status'], children: [
    { id: 'all', label: 'ad.status.allShort', query: { status: 'all' } },
    { id: 'active', label: 'ad.status.activeShort', query: {} },
    { id: 'draft', label: 'ad.status.draft', query: { status: 'draft' } },
    { id: 'published', label: 'ad.status.published', query: { status: 'published' } },
    { id: 'archived', label: 'ad.status.archived', query: { status: 'archived' } },
  ] },
  { id: 'gallery', to: '/admin/gallery', icon: 'gallery', label: 'admin.nav.gallery', group: 'content', watch: ['status'], children: [
    { id: 'all', label: 'ad.status.allShort', query: { status: 'all' } },
    { id: 'active', label: 'ad.status.activeShort', query: {} },
    { id: 'hidden', label: 'ad.gal.hidden', query: { status: 'draft' } },
    { id: 'published', label: 'ad.status.published', query: { status: 'published' } },
    { id: 'archived', label: 'ad.status.archived', query: { status: 'archived' } },
  ] },
]

export const GROUPS = [
  { id: 'overview', label: 'ad.nav.g.overview' },
  { id: 'people', label: 'ad.nav.g.people' },
  { id: 'content', label: 'ad.nav.g.content' },
]

// Which NAV item a location belongs to (a record editor belongs to its list).
export function navFor(pathname, search = '') {
  if (pathname === '/admin') {
    const tab = new URLSearchParams(search).get('tab')
    return NAV.find((n) => n.id === (tab === 'roles' ? 'roles' : tab === 'committee' ? 'committee' : 'dash'))
  }
  if (pathname === '/admin/students' && new URLSearchParams(search).get('tab') === 'imported') return NAV.find((n) => n.id === 'imported')
  return NAV.find((n) => !n.to.includes('?') && n.to !== '/admin' && (pathname === n.to || pathname.startsWith(`${n.to}/`)))
}

// Where a child leads: its parent's route with the child's filter added (the parent's own ?tab= is kept).
export function childTo(item, child) {
  const [path, q = ''] = item.to.split('?')
  const p = new URLSearchParams(q)
  for (const [k, v] of Object.entries(child.query)) p.set(k, v)
  const s = p.toString()
  return s ? `${path}?${s}` : path
}

// The child whose filter the address currently shows, or null when the filters match none of them.
export function activeChild(item, search = '') {
  if (!item.children) return null
  const p = new URLSearchParams(search)
  return item.children.find((c) => item.watch.every((k) => (p.get(k) || '') === (c.query[k] || ''))) || null
}

// Query parameters that describe the view itself (page and page size do not).
export function viewSummary(search) {
  const p = new URLSearchParams(search)
  return [...p.entries()].filter(([k, v]) => v && !['tab', 'page', 'limit', 'sort'].includes(k)).map(([, v]) => v)
}
