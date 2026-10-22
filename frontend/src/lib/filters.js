// Pure helpers behind the admin list toolbar (kept free of React so they can be unit tested).

// "Showing 21–40 of 126": the 1-based range of the current page.
export function pageRange(page, limit, total) {
  const p = Math.max(1, Number(page) || 1)
  const l = Math.max(1, Number(limit) || 20)
  if (!total) return { from: 0, to: 0 }
  const from = Math.min((p - 1) * l + 1, total)
  return { from, to: Math.min(p * l, total) }
}

// One chip per filter that differs from its default. `fields` describe how to print each value:
// { key, label, options: [[value, text]], type: 'select' | 'text' | 'date' }.
export function activeChips(values, defaults, fields, searchKey = 'q', searchLabel = 'Search') {
  const chips = []
  if (searchKey && values[searchKey]) chips.push({ key: searchKey, label: searchLabel, text: `“${values[searchKey]}”` })
  for (const f of fields) {
    const v = values[f.key]
    if (!v || v === (defaults?.[f.key] ?? '')) continue
    const hit = f.options?.find(([val]) => String(val) === String(v))
    chips.push({ key: f.key, label: f.label, text: hit ? hit[1] : v })
  }
  return chips
}

// True when every key of a quick view's patch is currently set to the patch's value.
export function viewIsActive(view, values) {
  return Object.entries(view.patch).every(([k, v]) => (values[k] ?? '') === v)
}

// ---- saved views (per admin, per section; kept in the browser, never used for authorization) ----

const MAX_VIEWS = 12

const storageKey = (userId, section) => `jk-views:${userId || 'anon'}:${section}`

export function loadViews(storage, userId, section) {
  try {
    const raw = JSON.parse(storage.getItem(storageKey(userId, section)) || '[]')
    return Array.isArray(raw) ? raw.filter((v) => v && typeof v.id === 'string' && typeof v.name === 'string' && v.patch && typeof v.patch === 'object') : []
  } catch {
    return []
  }
}

// Only string values of the keys the section really has are kept, so a view can never smuggle in anything else.
export function cleanPatch(values, allowedKeys) {
  const out = {}
  for (const k of allowedKeys) if (typeof values[k] === 'string' && values[k] !== '') out[k] = values[k]
  return out
}

export function saveView(storage, userId, section, name, patch) {
  const clean = String(name || '').trim().slice(0, 40)
  if (!clean || Object.keys(patch).length === 0) return { ok: false, reason: clean ? 'empty' : 'name' }
  const views = loadViews(storage, userId, section)
  if (views.some((v) => v.name.toLowerCase() === clean.toLowerCase())) return { ok: false, reason: 'duplicate' }
  if (views.length >= MAX_VIEWS) return { ok: false, reason: 'full' }
  const next = [...views, { id: `v${Date.now().toString(36)}${views.length}`, name: clean, patch }]
  try {
    storage.setItem(storageKey(userId, section), JSON.stringify(next))
  } catch {
    return { ok: false, reason: 'storage' }
  }
  return { ok: true, views: next }
}

export function deleteView(storage, userId, section, id) {
  const next = loadViews(storage, userId, section).filter((v) => v.id !== id)
  try {
    storage.setItem(storageKey(userId, section), JSON.stringify(next))
  } catch { /* ignore: the view simply stays */ }
  return next
}
