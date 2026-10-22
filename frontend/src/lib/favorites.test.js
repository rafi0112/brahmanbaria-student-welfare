import test from 'node:test'
import assert from 'node:assert/strict'
import { addFolder, addLink, countLinks, deleteFolder, emptyState, findLink, folders, moveLink, moveTop, parseState, removeLink, renameFolder, renameLink, setGroup, shift, toggleFolder, validTarget } from './favorites.js'

const add = (s, label, to, folderId) => {
  const r = addLink(s, { label, to }, folderId)
  assert.equal(r.ok, true, `${label}: ${r.reason}`)
  return r.state
}

test('only real admin routes with harmless queries are valid targets', () => {
  for (const ok of ['/admin', '/admin?tab=roles', '/admin/students?status=pending&q=rafi', '/admin/blog/new', '/admin/blog/25f99d96-d0e7-4230-b430-92f9336f32c0/edit', '/admin/activity']) {
    assert.equal(validTarget(ok), true, ok)
  }
  for (const bad of ['', '/', '/dashboard', 'https://evil.example/admin', '//evil.example/admin', '/admin/unknown', '/admin/students?q=<script>', '/admin/students?x=%3Cb%3E"', '/admin/../etc/passwd', null, 42]) {
    assert.equal(validTarget(bad), false, String(bad))
  }
})

test('adding shortcuts: validated, de-duplicated, limited', () => {
  let s = add(emptyState(), 'Pending students', '/admin/students?status=pending')
  assert.equal(findLink(s, '/admin/students?status=pending').label, 'Pending students')
  assert.equal(addLink(s, { label: 'Again', to: '/admin/students?status=pending' }).reason, 'duplicate')
  assert.equal(addLink(s, { label: 'X', to: 'https://evil.example' }).reason, 'invalid')
  assert.equal(addLink(s, { label: '   ', to: '/admin/blog' }).reason, 'name')
  for (let i = 0; i < 39; i++) s = add(s, `v${i}`, `/admin/blog?q=${i}`)
  assert.equal(countLinks(s), 40)
  assert.equal(addLink(s, { label: 'too many', to: '/admin/gallery' }).reason, 'full')
})

test('folders: create, rename, reject duplicates, delete only removes shortcuts', () => {
  let s = emptyState()
  let r = addFolder(s, ' Weekly ')
  assert.equal(r.ok, true)
  s = r.state
  const fid = r.id
  assert.equal(addFolder(s, 'weekly').reason, 'duplicate')
  s = add(s, 'Drafts', '/admin/blog?status=draft', fid)
  assert.equal(folders(s)[0].items.length, 1)
  assert.equal(renameFolder(s, fid, 'This week').ok, true)
  assert.equal(addLink(s, { label: 'x', to: '/admin' }, 'missing').reason, 'folder')
  s = deleteFolder(s, fid)
  assert.equal(s.items.length, 0)
  assert.equal(findLink(s, '/admin/blog?status=draft'), null)
})

test('moving, reordering and removing shortcuts', () => {
  let s = emptyState()
  s = add(s, 'A', '/admin/students')
  s = add(s, 'B', '/admin/blog')
  const f = addFolder(s, 'Folder')
  s = f.state
  const [a, b] = s.items.filter((i) => i.type === 'link')
  s = moveLink(s, a.id, { folderId: f.id })
  assert.deepEqual(folders(s)[0].items.map((l) => l.label), ['A'])
  assert.deepEqual(s.items.filter((i) => i.type === 'link').map((l) => l.label), ['B'])
  s = moveLink(s, b.id, { folderId: f.id, beforeId: a.id })
  assert.deepEqual(folders(s)[0].items.map((l) => l.label), ['B', 'A'])
  s = shift(s, b.id, 1)
  assert.deepEqual(folders(s)[0].items.map((l) => l.label), ['A', 'B'])
  s = shift(s, a.id, -1) // already first: unchanged
  assert.deepEqual(folders(s)[0].items.map((l) => l.label), ['A', 'B'])
  s = moveLink(s, a.id, { folderId: null })
  assert.equal(s.items.some((i) => i.id === a.id), true)
  s = moveTop(s, f.id, a.id)
  assert.equal(s.items[0].type, 'folder')
  assert.equal(renameLink(s, a.id, 'Renamed').ok, true)
  s = removeLink(s, a.id)
  assert.equal(findLink(s, '/admin/students'), null)
  assert.equal(findLink(s, '/admin/blog').label, 'B') // the other shortcut is untouched
  assert.equal(toggleFolder(s, f.id).items.find((i) => i.id === f.id).open, false)
  assert.equal(setGroup(s, 'content', false).groups.content, false)
})

test('stored data is validated on load', () => {
  const good = emptyState()
  const raw = JSON.stringify({ ...good, items: [
    { type: 'link', id: '1', label: 'Fine', to: '/admin/blog' },
    { type: 'link', id: '2', label: 'Evil', to: 'javascript:alert(1)' },
    { type: 'folder', id: 'f', name: 'F', open: true, items: [{ type: 'link', id: '3', label: 'Inside', to: '/admin/students' }, { id: '4', to: '/x' }] },
    { type: 'folder', id: 'g', name: '   ', items: [] },
    'junk',
  ], groups: { content: false, other: 'yes' } })
  const s = parseState(raw)
  assert.deepEqual(s.items.map((i) => i.id), ['1', 'f'])
  assert.deepEqual(s.items[1].items.map((l) => l.id), ['3'])
  assert.deepEqual(s.groups, { content: false })
  assert.deepEqual(parseState('{not json'), emptyState())
  assert.deepEqual(parseState(null), emptyState())
  assert.deepEqual(parseState(JSON.stringify({ v: 2, items: [] })), emptyState())
})
