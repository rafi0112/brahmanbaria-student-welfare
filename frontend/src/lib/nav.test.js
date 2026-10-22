import test from 'node:test'
import assert from 'node:assert/strict'
import { NAV, activeChild, childTo, navFor } from '../admin/nav.js'

const item = (id) => NAV.find((n) => n.id === id)

test('child links keep the parent route and add only their own filter', () => {
  assert.equal(childTo(item('requests'), item('requests').children[1]), '/admin/students?tab=requests&complete=yes')
  assert.equal(childTo(item('requests'), item('requests').children[2]), '/admin/students?tab=requests&complete=no')
  assert.equal(childTo(item('members'), item('members').children[1]), '/admin/students?tab=members&view=review')
  assert.equal(childTo(item('members'), item('members').children[0]), '/admin/students?tab=members')
  assert.equal(childTo(item('blog'), item('blog').children[0]), '/admin/blog?status=all')
  assert.equal(childTo(item('gallery'), item('gallery').children[2]), '/admin/gallery?status=draft')
})

test('the current child is decided by the address, and exactly one child matches', () => {
  for (const id of ['requests', 'members', 'directory', 'blog', 'heritage', 'gallery', 'contact']) {
    const it = item(id)
    for (const c of it.children) {
      const to = childTo(it, c)
      const search = to.includes('?') ? `?${to.split('?')[1]}` : ''
      assert.equal(activeChild(it, search)?.id, c.id, `${id}/${c.id}`)
      assert.equal(it.children.filter((x) => activeChild(it, search)?.id === x.id).length, 1)
    }
  }
  assert.equal(activeChild(item('requests'), '?tab=requests&complete=no&page=3&q=rafi')?.id, 'incomplete') // page and search do not change the view
  assert.equal(activeChild(item('members'), '?tab=members&view=verified&department=Law')?.id, 'verified')
  assert.equal(activeChild(item('blog'), '')?.id, 'active') // no status means the working set
  assert.equal(activeChild(item('dash'), ''), null)
})

test('locations map to their section', () => {
  assert.equal(navFor('/admin', '?tab=roles&role=member').id, 'roles')
  assert.equal(navFor('/admin', '').id, 'dash')
  assert.equal(navFor('/admin/blog/abc/edit', '').id, 'blog')
  assert.equal(navFor('/admin/students', '?status=approved').id, 'members')
})

test('students has two sections over the same accounts', () => {
  assert.deepEqual(item('requests').children.map((c) => c.id), ['all', 'complete', 'incomplete'])
  assert.deepEqual(item('members').children.map((c) => c.id), ['all', 'review', 'verified'])
  assert.deepEqual(item('directory').children.map((c) => c.id), ['all', 'awaiting', 'verified'])
  assert.deepEqual(NAV.filter((n) => n.group === 'students').map((n) => n.id), ['requests', 'members', 'directory']) // all three live under Students
  assert.equal(navFor('/admin/students', '?tab=imported&status=verified').id, 'directory')
  assert.equal(childTo(item('directory'), item('directory').children[2]), '/admin/students?tab=imported&status=verified')
  assert.equal(navFor('/admin/students', '?tab=members&view=review').id, 'members')
  assert.equal(navFor('/admin/students', '?tab=requests&complete=no').id, 'requests')
  assert.equal(navFor('/admin/students', '').id, 'requests')
  assert.equal(navFor('/admin/students', '?status=pending').id, 'requests')
  assert.equal(navFor('/admin/students', '?status=approved').id, 'members') // older links keep working
  assert.equal(activeChild(item('requests'), '?tab=requests&complete=yes').id, 'complete')
})
