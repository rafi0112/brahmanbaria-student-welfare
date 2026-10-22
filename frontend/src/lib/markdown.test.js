import test from 'node:test'
import assert from 'node:assert/strict'
import { blocks } from './markdownBlocks.js'

test('blocks splits on blank lines and drops empty ones', () => {
  assert.deepEqual(blocks('One\n\n\n\nTwo\r\n\r\n  \n\nThree'), ['One', 'Two', 'Three'])
  assert.deepEqual(blocks(''), [])
  assert.deepEqual(blocks(undefined), [])
})
