import test from 'node:test'
import assert from 'node:assert/strict'
import { batchNumbers } from './batches.js'

test('batch choices grow with the years, newest first, within what the server accepts', () => {
  const now = batchNumbers(new Date('2026-11-20'))
  assert.equal(now[0], 30)
  assert.equal(now.at(-1), 1)
  assert.equal(batchNumbers(new Date('2040-01-01'))[0], 44)
  assert.equal(batchNumbers(new Date('2090-01-01'))[0], 60)
})

test('this year\'s session follows the calendar', async () => {
  const { currentSession } = await import('./batches.js')
  assert.equal(currentSession(new Date('2026-11-20')), '2026-27')
  assert.equal(currentSession(new Date('2099-03-01'), '–'), '2099–00')
})
