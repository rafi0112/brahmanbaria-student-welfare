import test from 'node:test'
import assert from 'node:assert/strict'
import { NAV, activeChild, childTo, navFor } from '../admin/nav.js'

const item = (id) => NAV.find((n) => n.id === id)

test('child links keep the parent route and add only their own filter', () => {
  assert.deepEqual(item('students').children.map((c) => c.id), ['registered', 'imported']) // exactly two primary views
  assert.equal(childTo(item('students'), item('students').children[0]), '/admin/students')
  assert.equal(childTo(item('students'), item('students').children[1]), '/admin/students?tab=imported')
  assert.equal(item('roles').children, undefined) // administrators only: no Everyone/Member views
  assert.equal(childTo(item('blog'), item('blog').children[0]), '/admin/blog?status=all')
  assert.equal(childTo(item('gallery'), item('gallery').children[2]), '/admin/gallery?status=draft')
})

test('the current child is decided by the address, and exactly one child matches', () => {
  for (const id of ['students', 'blog', 'heritage', 'gallery', 'contact']) {
    const it = item(id)
    for (const c of it.children) {
      const to = childTo(it, c)
      const search = to.includes('?') ? `?${to.split('?')[1]}` : ''
      assert.equal(activeChild(it, search)?.id, c.id, `${id}/${c.id}`)
      assert.equal(it.children.filter((x) => activeChild(it, search)?.id === x.id).length, 1)
    }
  }
  assert.equal(activeChild(item('students'), '?status=pending&page=3&q=rafi')?.id, 'registered') // status, page and search stay inside the registered view
  assert.equal(activeChild(item('students'), '?tab=imported&status=verified')?.id, 'imported')
  assert.equal(activeChild(item('blog'), '')?.id, 'active') // no status means the working set
  assert.equal(activeChild(item('dash'), ''), null)
})

test('locations map to their section', () => {
  assert.equal(navFor('/admin', '?tab=roles&role=member').id, 'roles')
  assert.equal(navFor('/admin', '').id, 'dash')
  assert.equal(navFor('/admin/blog/abc/edit', '').id, 'blog')
  assert.equal(navFor('/admin/students', '?status=approved').id, 'students')
})

test('the imported directory is a view of Students, not a section of its own', () => {
  assert.equal(NAV.find((n) => n.id === 'imported'), undefined)
  assert.equal(navFor('/admin/students', '?tab=imported&status=verified').id, 'students')
  assert.equal(navFor('/admin/students', '?status=pending').id, 'students')
})
