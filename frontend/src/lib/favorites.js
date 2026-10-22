// Personal sidebar shortcuts ("favorites") and folders. Pure functions over a plain state object, so they are easy to test.
// The state is a convenience stored in this browser per admin; it never grants access to anything, and every target is
// checked against the list of real admin routes before it is stored or followed.

const MAX_LINKS = 40
const MAX_FOLDERS = 12
const MAX_NAME = 40

const ROUTES = [
  /^\/admin$/,
  /^\/admin\/(students|heritage|blog|gallery|activity)$/,
  /^\/admin\/(heritage|blog)\/new$/,
  /^\/admin\/(heritage|blog)\/[0-9a-f-]{8,40}\/edit$/,
]

// A target is "/admin..." plus an optional query made of harmless characters. Anything else is refused.
export function validTarget(to) {
  if (typeof to !== 'string' || to.length > 400 || !to.startsWith('/admin')) return false
  const [path, query = ''] = to.split('?')
  if (!ROUTES.some((r) => r.test(path))) return false
  return /^[A-Za-z0-9=&%._~+:,-]*$/.test(query)
}

export const emptyState = () => ({ v: 1, items: [], groups: {} })

const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)

function cleanLink(l) {
  if (!l || typeof l.id !== 'string' || typeof l.to !== 'string' || !validTarget(l.to)) return null
  const label = cleanName(l.label)
  return label ? { type: 'link', id: l.id, label, to: l.to } : null
}

// Reads stored JSON defensively: unknown shapes and unsafe targets are dropped instead of trusted.
export function parseState(raw) {
  try {
    const d = JSON.parse(raw || 'null')
    if (!d || d.v !== 1 || !Array.isArray(d.items)) return emptyState()
    const items = []
    for (const it of d.items.slice(0, MAX_LINKS + MAX_FOLDERS)) {
      if (it?.type === 'folder' && typeof it.id === 'string') {
        const name = cleanName(it.name)
        if (!name) continue
        items.push({ type: 'folder', id: it.id, name, open: it.open !== false, items: (Array.isArray(it.items) ? it.items : []).map(cleanLink).filter(Boolean) })
      } else {
        const l = cleanLink(it)
        if (l) items.push(l)
      }
    }
    const groups = {}
    for (const [k, v] of Object.entries(d.groups || {})) if (typeof v === 'boolean') groups[k] = v
    return { v: 1, items, groups }
  } catch {
    return emptyState()
  }
}

const links = (s) => s.items.flatMap((i) => (i.type === 'folder' ? i.items : [i]))
export const countLinks = (s) => links(s).length
export const countFolders = (s) => s.items.filter((i) => i.type === 'folder').length
export const findLink = (s, to) => links(s).find((l) => l.to === to) || null
export const folders = (s) => s.items.filter((i) => i.type === 'folder')

export function addLink(s, { label, to }, folderId = null) {
  if (!validTarget(to)) return { ok: false, reason: 'invalid' }
  const name = cleanName(label)
  if (!name) return { ok: false, reason: 'name' }
  if (findLink(s, to)) return { ok: false, reason: 'duplicate' }
  if (countLinks(s) >= MAX_LINKS) return { ok: false, reason: 'full' }
  const link = { type: 'link', id: uid('l'), label: name, to }
  if (folderId) {
    const f = s.items.find((i) => i.type === 'folder' && i.id === folderId)
    if (!f) return { ok: false, reason: 'folder' }
    return { ok: true, id: link.id, state: { ...s, items: s.items.map((i) => (i === f ? { ...f, open: true, items: [...f.items, link] } : i)) } }
  }
  return { ok: true, id: link.id, state: { ...s, items: [...s.items, link] } }
}

export function removeLink(s, id) {
  return { ...s, items: s.items.map((i) => (i.type === 'folder' ? { ...i, items: i.items.filter((l) => l.id !== id) } : i)).filter((i) => i.type === 'folder' || i.id !== id) }
}

export function renameLink(s, id, label) {
  const name = cleanName(label)
  if (!name) return { ok: false, reason: 'name' }
  const map = (l) => (l.id === id ? { ...l, label: name } : l)
  return { ok: true, state: { ...s, items: s.items.map((i) => (i.type === 'folder' ? { ...i, items: i.items.map(map) } : map(i))) } }
}

export function addFolder(s, name) {
  const n = cleanName(name)
  if (!n) return { ok: false, reason: 'name' }
  if (folders(s).some((f) => f.name.toLowerCase() === n.toLowerCase())) return { ok: false, reason: 'duplicate' }
  if (countFolders(s) >= MAX_FOLDERS) return { ok: false, reason: 'full' }
  const folder = { type: 'folder', id: uid('f'), name: n, open: true, items: [] }
  return { ok: true, id: folder.id, state: { ...s, items: [...s.items, folder] } }
}

export function renameFolder(s, id, name) {
  const n = cleanName(name)
  if (!n) return { ok: false, reason: 'name' }
  if (folders(s).some((f) => f.id !== id && f.name.toLowerCase() === n.toLowerCase())) return { ok: false, reason: 'duplicate' }
  return { ok: true, state: { ...s, items: s.items.map((i) => (i.type === 'folder' && i.id === id ? { ...i, name: n } : i)) } }
}

// Deleting a folder removes the shortcuts inside it; the pages and views they pointed to are untouched.
export const deleteFolder = (s, id) => ({ ...s, items: s.items.filter((i) => !(i.type === 'folder' && i.id === id)) })
export const toggleFolder = (s, id, open) => ({ ...s, items: s.items.map((i) => (i.type === 'folder' && i.id === id ? { ...i, open: open ?? !i.open } : i)) })
export const setGroup = (s, key, open) => ({ ...s, groups: { ...s.groups, [key]: open } })

function insert(list, item, beforeId) {
  const at = beforeId ? list.findIndex((x) => x.id === beforeId) : -1
  const out = list.filter((x) => x.id !== item.id)
  const idx = at < 0 ? out.length : out.findIndex((x) => x.id === beforeId)
  out.splice(idx < 0 ? out.length : idx, 0, item)
  return out
}

// Moves a shortcut to a folder (folderId) or to the top level (null), optionally before another item.
export function moveLink(s, id, { folderId = null, beforeId = null } = {}) {
  const link = links(s).find((l) => l.id === id)
  if (!link) return s
  if (folderId && !folders(s).some((f) => f.id === folderId)) return s
  const without = removeLink(s, id)
  if (folderId) {
    return { ...without, items: without.items.map((i) => (i.type === 'folder' && i.id === folderId ? { ...i, open: true, items: insert(i.items, link, beforeId) } : i)) }
  }
  return { ...without, items: insert(without.items, link, beforeId) }
}

// Reorders a top-level folder (or link) before another top-level item.
export function moveTop(s, id, beforeId = null) {
  const item = s.items.find((i) => i.id === id)
  return item ? { ...s, items: insert(s.items, item, beforeId) } : s
}

// Moves an item one place up (-1) or down (+1) inside the list that holds it.
export function shift(s, id, delta) {
  const swap = (list) => {
    const i = list.findIndex((x) => x.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= list.length) return list
    const out = [...list]
    ;[out[i], out[j]] = [out[j], out[i]]
    return out
  }
  if (s.items.some((i) => i.id === id)) return { ...s, items: swap(s.items) }
  return { ...s, items: s.items.map((i) => (i.type === 'folder' && i.items.some((l) => l.id === id) ? { ...i, items: swap(i.items) } : i)) }
}

export const storageKey = (userId) => `jk-fav:${userId || 'anon'}`
