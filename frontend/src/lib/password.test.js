import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPassword, suggestPassword, MIN_LENGTH } from './password.js'

const failed = (pw, who) => checkPassword(pw, who).rules.filter((r) => !r.ok).map((r) => r.id)

test('length is the only rule: 6 to 72 characters, anything else is allowed', () => {
  for (const pw of ['123456', 'abcdef', 'aaaaaa', 'password', 'Kp7#mQ2vRt', 'amar sonar bangla', 'নিরাপদ']) assert.deepEqual(failed(pw), [], pw)
  assert.deepEqual(failed('Rafiul Islam', { name: 'Rafiul Islam' }), [])
  assert.ok(failed('abcde').includes('length'))
  assert.ok(failed('x'.repeat(73)).includes('length'))
  assert.equal(MIN_LENGTH, 6)
})

test('the meter is weak only when too short, then grows with length', () => {
  assert.equal(checkPassword('').score, 0)
  assert.equal(checkPassword('abcde').score, 1)
  assert.equal(checkPassword('123456').score, 2)
  assert.equal(checkPassword('Kp7#mQ2vRt').score, 3)
  assert.equal(checkPassword('correct horse battery').score, 4)
})

test('suggested passwords always pass and are not repeated', () => {
  const seen = new Set()
  for (let i = 0; i < 200; i++) {
    const pw = suggestPassword()
    assert.ok(checkPassword(pw).ok, pw)
    assert.ok(!/[0O1lI]/.test(pw), pw)
    seen.add(pw)
  }
  assert.equal(seen.size, 200)
})
