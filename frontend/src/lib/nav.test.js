import test from 'node:test'
import assert from 'node:assert/strict'
import { NAV, activeChild, childTo, navFor } from '../admin/nav.js'

const item = (id) => NAV.find((n) => n.id === id)

test('child links keep the parent route and add only their own filter', () => {
  assert.equal(childTo(item('requests'), item('requests').children[1]), '/admin/students?status=pending')
  assert.equal(childTo(item('requests'), item('requests').children[0]), '/admin/students')
  assert.equal(childTo(item('requests'), item('requests').children[4]), '/admin/students?complete=no')
  assert.equal(childTo(item('directory'), item('directory').children[1]), '/admin/students?tab=imported&status=awaiting')
  assert.equal(item('roles').children, undefined) // administrators only: no Everyone/Member views
  assert.equal(childTo(item('blog'), item('blog').children[0]), '/admin/blog?status=all')
  assert.equal(childTo(item('gallery'), item('gallery').children[2]), '/admin/gallery?status=draft')
})

test('the current child is decided by the address, and exactly one child matches', () => {
  for (const id of ['directory', 'requests', 'blog', 'heritage', 'gallery', 'contact']) {
    const it = item(id)
    for (const c of it.children) {
      const to = childTo(it, c)
      const search = to.includes('?') ? `?${to.split('?')[1]}` : ''
      assert.equal(activeChild(it, search)?.id, c.id, `${id}/${c.id}`)
      assert.equal(it.children.filter((x) => activeChild(it, search)?.id === x.id).length, 1)
    }
  }
  assert.equal(activeChild(item('requests'), '?status=pending&page=3&q=rafi')?.id, 'pending') // page and search do not change the view
  assert.equal(activeChild(item('requests'), '?status=pending&complete=no'), null) // a combination is no single view
  assert.equal(activeChild(item('blog'), '')?.id, 'active') // no status means the working set
  assert.equal(activeChild(item('dash'), ''), null)
})

test('locations map to their section', () => {
  assert.equal(navFor('/admin', '?tab=roles&role=member').id, 'roles')
  assert.equal(navFor('/admin', '').id, 'dash')
  assert.equal(navFor('/admin/blog/abc/edit', '').id, 'blog')
  assert.equal(navFor('/admin/students', '?status=approved').id, 'requests')
})

test('students has two sections: the member directory and membership requests', () => {
  assert.deepEqual(item('directory').children.map((c) => c.id), ['all', 'awaiting', 'verified'])
  assert.deepEqual(item('requests').children.map((c) => c.id), ['all', 'pending', 'approved', 'rejected', 'incomplete'])
  assert.equal(navFor('/admin/students', '?tab=imported&status=verified').id, 'directory')
  assert.equal(navFor('/admin/students', '?status=pending').id, 'requests')
  assert.equal(activeChild(item('directory'), '?tab=imported&status=awaiting').id, 'awaiting')
})
