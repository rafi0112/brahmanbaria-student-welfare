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
    { id: 'read', label: 'ad.ct.read', query: { status: 'read' } },
  ] },
  // Students is a dropdown of two plain pages. Membership Requests is the pending queue (tabs: all, complete, incomplete profiles).
  // Membership Directory holds everyone: registered members (all / needs review / verified) and the original directory records
  // (all / needs verification / verified), switched inside the page.
  // Members is every registered account, those needing review and the verified (approved with a confirmed email); Member Directory
  // is the original directory of people (needs verification / verified).
  { id: 'requests', to: '/admin/students?tab=requests', icon: 'clock', label: 'ad.nav.requests', group: 'students', watch: ['complete'], tabs: [
    { id: 'all', label: 'ad.req.all', query: {} },
    { id: 'complete', label: 'ad.req.complete', query: { complete: 'yes' } },
    { id: 'incomplete', label: 'ad.stu.view.incomplete', query: { complete: 'no' } },
  ] },
  { id: 'directory', to: '/admin/students?tab=members', icon: 'directory', label: 'ad.nav.directory', group: 'students' },
  { id: 'roles', to: '/admin?tab=roles', icon: 'shield', label: 'admin.tab.roles', group: 'people' },
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
  { id: 'people', label: 'ad.nav.g.admin' },
  { id: 'content', label: 'ad.nav.g.content' },
]

// Which NAV item a location belongs to (a record editor belongs to its list).
export function navFor(pathname, search = '') {
  if (pathname === '/admin') {
    const tab = new URLSearchParams(search).get('tab')
    return NAV.find((n) => n.id === (tab === 'roles' ? 'roles' : tab === 'committee' ? 'committee' : 'dash'))
  }
  if (pathname === '/admin/students') {
    const p = new URLSearchParams(search)
    const tab = p.get('tab')
    const st = p.get('status')
    if (tab === 'imported') return NAV.find((n) => n.id === 'directory')
    const members = tab === 'members' || (!tab && st && st !== 'pending')
    return NAV.find((n) => n.id === (members ? 'directory' : 'requests'))
  }
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
  const kids = item.children || item.tabs
  if (!kids) return null
  const p = new URLSearchParams(search)
  return kids.find((c) => item.watch.every((k) => (p.get(k) || '') === (c.query[k] || ''))) || null
}

// Query parameters that describe the view itself (page and page size do not).
export function viewSummary(search) {
  const p = new URLSearchParams(search)
  return [...p.entries()].filter(([k, v]) => v && !['tab', 'page', 'limit', 'sort'].includes(k)).map(([, v]) => v)
}
