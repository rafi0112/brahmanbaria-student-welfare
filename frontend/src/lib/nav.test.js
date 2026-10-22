import test from 'node:test'
import assert from 'node:assert/strict'
import { NAV, activeChild, childTo, navFor } from '../admin/nav.js'

const item = (id) => NAV.find((n) => n.id === id)

test('child links keep the parent route and add only their own filter', () => {
  assert.equal(childTo(item('students'), item('students').children[1]), '/admin/students?status=pending')
  assert.equal(childTo(item('students'), item('students').children[0]), '/admin/students')
  assert.equal(childTo(item('students'), item('students').children[4]), '/admin/students?complete=no')
  assert.equal(childTo(item('roles'), item('roles').children[1]), '/admin?tab=roles&role=admin')
  assert.equal(childTo(item('roles'), item('roles').children[0]), '/admin?tab=roles')
  assert.equal(childTo(item('blog'), item('blog').children[0]), '/admin/blog?status=all')
  assert.equal(childTo(item('gallery'), item('gallery').children[2]), '/admin/gallery?status=draft')
})

test('the current child is decided by the address, and exactly one child matches', () => {
  for (const id of ['students', 'roles', 'blog', 'gallery']) {
    const it = item(id)
    for (const c of it.children) {
      const to = childTo(it, c)
      const search = to.includes('?') ? `?${to.split('?')[1]}` : ''
      assert.equal(activeChild(it, search)?.id, c.id, `${id}/${c.id}`)
      assert.equal(it.children.filter((x) => activeChild(it, search)?.id === x.id).length, 1)
    }
  }
  assert.equal(activeChild(item('students'), '?status=pending&page=3&q=rafi')?.id, 'pending') // page and search do not change the view
  assert.equal(activeChild(item('students'), '?status=pending&complete=no'), null) // a combination is no single view
  assert.equal(activeChild(item('blog'), '')?.id, 'active') // no status means the working set
  assert.equal(activeChild(item('dash'), ''), null)
})

test('locations map to their section', () => {
  assert.equal(navFor('/admin', '?tab=roles&role=member').id, 'roles')
  assert.equal(navFor('/admin', '').id, 'dash')
  assert.equal(navFor('/admin/blog/abc/edit', '').id, 'blog')
  assert.equal(navFor('/admin/students', '?status=approved').id, 'students')
})
