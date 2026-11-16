import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initials } from './initials.js'

test('a monogram is one letter: the first letter of the name', () => {
  assert.equal(initials('Md Aminul Islam (Sumon)'), 'M')
  assert.equal(initials('(Sumon) Rahman'), 'S')
  assert.equal(initials('abdullah al arafat'), 'A')
  assert.equal(initials('  নুসরাত জাহান'), 'ন')
  assert.equal(initials('"Rafi"'), 'R')
  assert.equal(initials(''), '?')
  assert.equal(initials(undefined), '?')
})
