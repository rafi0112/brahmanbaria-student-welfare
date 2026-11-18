import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, rowsFromCsv } from './csv.js'

test('reads quoted fields, doubled quotes, commas and line breaks inside quotes', () => {
  const t = '﻿name,note\r\n"Rahim, Uddin","says ""hi""\nagain"\r\nKarim,\r\n\r\n'
  assert.deepEqual(parseCsv(t), [['name', 'note'], ['Rahim, Uddin', 'says "hi"\nagain'], ['Karim', '']])
})

test('reads semicolon files', () => {
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']])
})

test('matches English and Bangla headings and ignores unknown ones', () => {
  const r = rowsFromCsv('নাম,ব্যাচ,Department,Mobile Number,Favourite colour\nআলী,১৫,CSE,01712345678,blue')
  assert.deepEqual(r.rows, [{ name: 'আলী', batch: '১৫', department: 'CSE', phone: '01712345678' }])
  assert.deepEqual(r.unknown, ['Favourite colour'])
})

test('needs a name column and at least one row', () => {
  assert.equal(rowsFromCsv('batch\n12').error, 'no_name')
  assert.equal(rowsFromCsv('name').error, 'empty')
})
