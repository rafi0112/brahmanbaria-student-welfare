import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPassword, suggestPassword, MIN_LENGTH } from './password.js'

const failed = (pw, who) => checkPassword(pw, who).rules.filter((r) => !r.ok).map((r) => r.id)

test('a password must be long and mix lower, upper, digits and symbols', () => {
  assert.deepEqual(failed('Kp7#mQ2vRt'), [])
  assert.ok(failed('Kp7#mQ2v').includes('length'))
  assert.ok(failed('kp7#mq2vrtx').includes('upper'))
  assert.ok(failed('KP7#MQ2VRTX').includes('lower'))
  assert.ok(failed('Kp#mQvRtxyz').includes('digit'))
  assert.ok(failed('Kp7mQ2vRtxy').includes('symbol'))
  assert.equal(MIN_LENGTH, 10)
})

test('common words, sequences, repeats and the person\'s own name or email are refused', () => {
  assert.ok(failed('Password#2024').includes('common'))
  assert.ok(failed('Brahmanbaria#77').includes('common'))
  assert.ok(failed('Xy#1234zQwv').includes('common'))
  assert.ok(failed('Xy#aaa9zQwvK').includes('common'))
  assert.ok(failed('Rafiul#Strong9', { name: 'Rafiul Islam' }).includes('personal'))
  assert.ok(failed('Xq9#computer!', { email: 'computer082@gmail.com' }).includes('personal'))
  assert.deepEqual(failed('Xq9#mvTz!Lp4', { email: 'computer082@gmail.com', name: 'Rafiul Islam' }), [])
})

test('the meter grows with the password and only a passing one is good or strong', () => {
  assert.equal(checkPassword('').score, 0)
  assert.equal(checkPassword('abc').score, 1)
  assert.ok(checkPassword('Kp7#mQ2vRt').score >= 3)
  assert.equal(checkPassword('Kp7#mQ2vRtX9!wLz').score, 4)
  assert.ok(checkPassword('password').score < 3)
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
