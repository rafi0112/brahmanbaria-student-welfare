import test from 'node:test'
import assert from 'node:assert/strict'
import { authStatus, readUrlAuthError, toApiError } from './authErrors.js'

test('authStatus maps Supabase errors to UI statuses', () => {
  assert.equal(authStatus({ code: 'email_not_confirmed', message: 'Email not confirmed' }), 403)
  assert.equal(authStatus({ message: 'Email not confirmed' }), 403)
  assert.equal(authStatus({ code: 'invalid_credentials', message: 'Invalid login credentials' }), 401)
  assert.equal(authStatus({ code: 'over_email_send_rate_limit' }), 429)
  assert.equal(authStatus({ status: 429 }), 429)
  assert.equal(authStatus({ code: 'weak_password' }), 422)
  assert.equal(authStatus({ status: 503 }), 500)
  assert.equal(authStatus({ message: 'something else' }), 400)
})

test('toApiError keeps status and code', () => {
  const e = toApiError({ code: 'weak_password', message: 'x' })
  assert.equal(e.status, 422)
  assert.equal(e.code, 'weak_password')
})

test('readUrlAuthError reads expired-link errors from hash or query', () => {
  const hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
  assert.deepEqual(readUrlAuthError('', hash), { code: 'otp_expired', description: 'Email link is invalid or has expired' })
  assert.equal(readUrlAuthError('?error=access_denied', '').code, 'access_denied')
  assert.equal(readUrlAuthError('?email=a%40b.c', '#access_token=abc&type=signup'), null)
  assert.equal(readUrlAuthError('', ''), null)
})
