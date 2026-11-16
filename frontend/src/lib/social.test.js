import { test } from 'node:test'
import assert from 'node:assert/strict'

// import.meta.env is empty under node, so the module-level constant is ''
const { facebookPageUrl, FACEBOOK_PAGE_URL } = await import('./social.js').catch(() => ({}))

test('only an https Facebook address is ever linked', () => {
  assert.equal(FACEBOOK_PAGE_URL, '')
  assert.equal(facebookPageUrl('https://www.facebook.com/share/abc/'), 'https://www.facebook.com/share/abc/')
  assert.equal(facebookPageUrl('https://facebook.com/bswa.jnu'), 'https://facebook.com/bswa.jnu')
  assert.equal(facebookPageUrl('https://m.facebook.com/bswa'), 'https://m.facebook.com/bswa')
  assert.equal(facebookPageUrl('https://fb.me/bswa'), 'https://fb.me/bswa')
  assert.equal(facebookPageUrl(''), '')
  assert.equal(facebookPageUrl(undefined), '')
  assert.equal(facebookPageUrl('http://facebook.com/bswa'), '')
  assert.equal(facebookPageUrl('https://evil.example/facebook.com'), '')
  assert.equal(facebookPageUrl('https://facebook.com.evil.example/x'), '')
  assert.equal(facebookPageUrl('https://user:pw@facebook.com/x'), '')
  assert.equal(facebookPageUrl('javascript:alert(1)'), '')
})
