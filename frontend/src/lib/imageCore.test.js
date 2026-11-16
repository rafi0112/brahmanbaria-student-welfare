import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_ORIGINAL, PROFILES, checkFile, fitWithin, formatBytes, pathFor, sha256Hex } from './imageCore.js'

const file = (name, type, size) => ({ name, type, size })

test('only photos of a sensible size are accepted; SVG and GIF are refused on purpose', () => {
  assert.equal(checkFile(file('a.jpg', 'image/jpeg', 500 * 1024)), '')
  assert.equal(checkFile(file('a.png', 'image/png', 15 * 1024 * 1024)), '')
  assert.equal(checkFile(file('a.webp', 'image/webp', 2 * 1024 * 1024)), '')
  assert.equal(checkFile(file('a.jpg', 'image/jpeg', MAX_ORIGINAL + 1)), 'too_big')
  assert.equal(checkFile(file('a.svg', 'image/svg+xml', 100)), 'svg')
  assert.equal(checkFile(file('renamed.svg', '', 100)), 'svg')
  assert.equal(checkFile(file('a.gif', 'image/gif', 100)), 'gif')
  assert.equal(checkFile(file('a.exe', 'application/octet-stream', 100)), 'type')
  assert.equal(checkFile(file('a.jpg', 'image/jpeg', 0)), 'empty')
})

test('a picture is scaled to its profile, keeps its shape and is never enlarged', () => {
  assert.deepEqual(fitWithin(4000, 3000, 1280), { w: 1280, h: 960 })
  assert.deepEqual(fitWithin(3000, 4000, 1280), { w: 960, h: 1280 })
  assert.deepEqual(fitWithin(800, 600, 1280), { w: 800, h: 600 })
  assert.deepEqual(fitWithin(1280, 1280, 1280), { w: 1280, h: 1280 })
  assert.deepEqual(fitWithin(10000, 1, 400), { w: 400, h: 1 })
  assert.deepEqual(Object.keys(PROFILES), ['avatar', 'blog', 'gallery', 'heritage', 'event', 'hero'])
  assert.ok(Object.values(PROFILES).every((p) => p.target <= 1500 * 1024))
})

test('the same bytes always get the same name, whatever the file was called', async () => {
  const a = new Blob([new Uint8Array([1, 2, 3, 4])])
  const b = new Blob([new Uint8Array([1, 2, 3, 4])])
  const c = new Blob([new Uint8Array([1, 2, 3, 5])])
  const [ha, hb, hc] = await Promise.all([sha256Hex(a), sha256Hex(b), sha256Hex(c)])
  assert.equal(ha, hb)
  assert.notEqual(ha, hc)
  assert.match(ha, /^[0-9a-f]{64}$/)
  // the same UUID-shaped name the server makes (Go: contentName), so uploads from the browser and from the server agree
  const abc = await sha256Hex(new Blob(['abc']))
  assert.equal(abc, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(pathFor(abc, '.jpg'), 'ba7816bf-8f01-cfea-4141-40de5dae2223.jpg')
  assert.match(pathFor(hc, '.png'), /^[0-9a-f-]{36}\.png$/)
})

test('sizes read naturally', () => {
  assert.equal(formatBytes(500), '1 KB')
  assert.equal(formatBytes(250 * 1024), '250 KB')
  assert.equal(formatBytes(1.5 * 1024 * 1024), '1.5 MB')
})
