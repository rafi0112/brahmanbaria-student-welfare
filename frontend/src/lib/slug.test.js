import test from 'node:test'
import assert from 'node:assert/strict'
import { slugFrom } from './slug.js'

test('slugFrom builds a safe URL name', () => {
  assert.equal(slugFrom("Rivers of B'baria!"), 'rivers-of-b-baria')
  assert.equal(slugFrom('  --Hello   World--  '), 'hello-world')
  assert.equal(slugFrom('২০২৬ সালের গল্প'), '')
  assert.equal(slugFrom(undefined), '')
  assert.equal(slugFrom('a'.repeat(120)).length, 80)
})
