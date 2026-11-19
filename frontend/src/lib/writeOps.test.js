import test from 'node:test'
import assert from 'node:assert/strict'
import { continueList, insertBlock, isWebLink, link, prefixLines, readMinutes, wordCount, wrap } from './writeOps.js'

const apply = (v, r) => v.slice(0, r.from) + r.text + v.slice(r.to)

test('bold wraps the selection, a second press unwraps, nothing selected inserts a sample to type over', () => {
  const v = 'a word here'
  const r = wrap(v, 2, 6, '**', '**', 'bold')
  assert.equal(apply(v, r), 'a **word** here')
  const v2 = apply(v, r)
  assert.equal(v2.slice(r.selA, r.selB), 'word')
  assert.equal(apply(v2, wrap(v2, r.selA, r.selB, '**', '**', 'bold')), v)
  const e = wrap('', 0, 0, '*', '*', 'italic')
  assert.equal(apply('', e), '*italic*')
  assert.equal(apply('', e).slice(e.selA, e.selB), 'italic')
})

test('lists, headings and quotes become their own block, numbered in order, and toggle off', () => {
  const v = 'Intro\nmilk\neggs\nend'
  const r = prefixLines(v, 6, 15, 'ul')
  assert.equal(apply(v, r), 'Intro\n\n- milk\n- eggs\n\nend')
  const o = prefixLines('one\ntwo', 0, 7, 'ol')
  assert.equal(apply('one\ntwo', o), '1. one\n2. two')
  assert.equal(apply('1. one\n2. two', prefixLines('1. one\n2. two', 0, 13, 'ol')), 'one\ntwo')
  const h = prefixLines('Title text', 3, 3, 'h2')
  assert.equal(apply('Title text', h), '## Title text')
  const s = prefixLines('', 0, 0, 'quote', 'A quote')
  const q = apply('', s)
  assert.equal(q, '> A quote')
  assert.equal(q.slice(s.selA, s.selB), 'A quote')
})

test('a picture or a divider stands apart with blank lines', () => {
  const v = 'before after'
  const r = insertBlock(v, 6, 6, '![Titas](https://x.org/a.jpg)')
  assert.equal(apply(v, r), 'before\n\n![Titas](https://x.org/a.jpg)\n\n after')
  assert.equal(apply('', insertBlock('', 0, 0, '---')), '---')
})

test('links use the selected words; Enter continues a list and an empty item ends it', () => {
  assert.equal(apply('see here', link('see here', 4, 8, 'https://bswa.org')), 'see [here](https://bswa.org)')
  const v = '- milk'
  const r = continueList(v, 6, 6)
  assert.equal(apply(v, r), '- milk\n- ')
  const n = continueList('3. tea', 6, 6)
  assert.equal(apply('3. tea', n), '3. tea\n4. ')
  const end = continueList('- milk\n- ', 9, 9)
  assert.equal(apply('- milk\n- ', end), '- milk\n')
  assert.equal(continueList('plain text', 10, 10), null)
})

test('words, reading time and web links', () => {
  assert.equal(wordCount('আমাদের তিতাস নদী, **সুন্দর**! ![x](https://a.b/c.jpg)'), 4)
  assert.equal(readMinutes(30), 1)
  assert.equal(readMinutes(1000), 5)
  assert.equal(isWebLink('https://bswa.org/x'), true)
  assert.equal(isWebLink('javascript:alert(1)'), false)
})
