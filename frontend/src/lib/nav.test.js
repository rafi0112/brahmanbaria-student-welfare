import test from 'node:test'
import assert from 'node:assert/strict'
import { NAV, activeChild, childTo, navFor } from '../admin/nav.js'

const item = (id) => NAV.find((n) => n.id === id)

test('child links keep the parent route and add only their own filter', () => {
  assert.equal(childTo(item('requests'), item('requests').tabs[1]), '/admin/students?tab=requests&complete=yes')
  assert.equal(childTo(item('requests'), item('requests').tabs[2]), '/admin/students?tab=requests&complete=no')
  assert.equal(childTo(item('blog'), item('blog').children[0]), '/admin/blog?status=all')
  assert.equal(childTo(item('gallery'), item('gallery').children[2]), '/admin/gallery?status=draft')
})

test('the current child is decided by the address, and exactly one child matches', () => {
  for (const id of ['requests', 'blog', 'heritage', 'gallery', 'contact']) {
    const it = item(id)
    for (const c of (it.children || it.tabs)) {
      const to = childTo(it, c)
      const search = to.includes('?') ? `?${to.split('?')[1]}` : ''
      assert.equal(activeChild(it, search)?.id, c.id, `${id}/${c.id}`)
      assert.equal((it.children || it.tabs).filter((x) => activeChild(it, search)?.id === x.id).length, 1)
    }
  }
  assert.equal(activeChild(item('requests'), '?tab=requests&complete=no&page=3&q=rafi')?.id, 'incomplete') // page and search do not change the view
  assert.equal(activeChild(item('blog'), '')?.id, 'active') // no status means the working set
  assert.equal(activeChild(item('dash'), ''), null)
})

test('locations map to their section', () => {
  assert.equal(navFor('/admin', '?tab=roles&role=member').id, 'roles')
  assert.equal(navFor('/admin', '').id, 'dash')
  assert.equal(navFor('/admin/blog/abc/edit', '').id, 'blog')
  assert.equal(navFor('/admin/students', '?status=approved').id, 'directory')
})

test('students has two pages: membership requests and the membership directory', () => {
  assert.deepEqual(NAV.filter((n) => n.group === 'students').map((n) => n.id), ['requests', 'directory'])
  assert.deepEqual(item('requests').tabs.map((c) => c.id), ['all', 'complete', 'incomplete'])
  assert.equal(item('directory').children, undefined)
  assert.equal(navFor('/admin/students', '?tab=members&view=review').id, 'directory')
  assert.equal(navFor('/admin/students', '?tab=imported&status=verified').id, 'directory') // the directory records live inside the same page
  assert.equal(navFor('/admin/students', '?tab=requests&complete=no').id, 'requests')
  assert.equal(navFor('/admin/students', '').id, 'requests')
  assert.equal(navFor('/admin/students', '?status=pending').id, 'requests')
  assert.equal(navFor('/admin/students', '?status=approved').id, 'directory') // older links keep working
  assert.equal(activeChild(item('requests'), '?tab=requests&complete=yes').id, 'complete')
})
test('the students pages are plain sidebar items whose tabs live in the page', () => {
  assert.equal(item('requests').children, undefined)
  assert.equal(item('requests').tabs.length, 3)
})
