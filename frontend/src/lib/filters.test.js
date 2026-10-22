import test from 'node:test'
import assert from 'node:assert/strict'
import { activeChips, cleanPatch, deleteView, loadViews, pageRange, saveView, viewIsActive } from './filters.js'

const memory = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }
}

test('pageRange reports the visible slice and handles empty and last pages', () => {
  assert.deepEqual(pageRange(1, 20, 126), { from: 1, to: 20 })
  assert.deepEqual(pageRange(2, 20, 126), { from: 21, to: 40 })
  assert.deepEqual(pageRange(7, 20, 126), { from: 121, to: 126 })
  assert.deepEqual(pageRange(1, 20, 0), { from: 0, to: 0 })
  assert.deepEqual(pageRange(99, 20, 5), { from: 5, to: 5 })
})

test('activeChips lists only filters that differ from the default, with readable values', () => {
  const fields = [
    { key: 'status', label: 'Status', options: [['published', 'Published'], ['draft', 'Draft']] },
    { key: 'from', label: 'From' },
    { key: 'sort', label: 'Sort', options: [['updated', 'Recently updated']] },
  ]
  const chips = activeChips({ q: 'river', status: 'published', from: '2026-01-01', sort: 'updated' }, { sort: 'updated' }, fields)
  assert.deepEqual(chips.map((c) => [c.key, c.text]), [['q', '“river”'], ['status', 'Published'], ['from', '2026-01-01']])
  assert.deepEqual(activeChips({ q: '', status: '' }, {}, fields), [])
})

test('viewIsActive compares every key of the quick view', () => {
  assert.equal(viewIsActive({ patch: { status: 'pending' } }, { status: 'pending', q: 'x' }), true)
  assert.equal(viewIsActive({ patch: { status: 'pending', complete: 'no' } }, { status: 'pending' }), false)
  assert.equal(viewIsActive({ patch: { status: '' } }, { status: '' }), true)
})

test('saved views are stored per admin and section, validated, and deletable', () => {
  const store = memory()
  assert.deepEqual(loadViews(store, 'a1', 'blog'), [])
  const patch = cleanPatch({ status: 'draft', page: '3', category: '', junk: 'x', q: 'rivers' }, ['status', 'category', 'q'])
  assert.deepEqual(patch, { status: 'draft', q: 'rivers' })
  const first = saveView(store, 'a1', 'blog', '  My drafts  ', patch)
  assert.equal(first.ok, true)
  assert.equal(first.views[0].name, 'My drafts')
  assert.equal(saveView(store, 'a1', 'blog', 'my DRAFTS', patch).reason, 'duplicate')
  assert.equal(saveView(store, 'a1', 'blog', '', patch).reason, 'name')
  assert.equal(saveView(store, 'a1', 'blog', 'Nothing', {}).reason, 'empty')
  assert.equal(loadViews(store, 'a2', 'blog').length, 0) // another admin does not see it
  assert.equal(loadViews(store, 'a1', 'places').length, 0) // nor does another section
  assert.deepEqual(deleteView(store, 'a1', 'blog', first.views[0].id), [])
})

test('saved views survive corrupt storage and refuse to overflow', () => {
  const bad = { getItem: () => '{not json', setItem: () => { throw new Error('quota') } }
  assert.deepEqual(loadViews(bad, 'a1', 'blog'), [])
  assert.equal(saveView(bad, 'a1', 'blog', 'x', { q: 'a' }).reason, 'storage')
  const store = memory()
  for (let i = 0; i < 12; i++) assert.equal(saveView(store, 'a1', 's', `view ${i}`, { q: String(i) }).ok, true)
  assert.equal(saveView(store, 'a1', 's', 'one too many', { q: 'z' }).reason, 'full')
})
