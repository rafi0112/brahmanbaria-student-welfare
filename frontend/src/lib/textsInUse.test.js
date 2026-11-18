import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strings } from '../data/strings.js'
import { UNUSED_TEXTS } from '../admin/unusedTexts.js'

// The "Website texts" page hides the texts no page uses (editing them would change nothing). This keeps that list true:
// a text that a page starts using must leave it, and a text that falls out of use must join it.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
export function unusedKeys() {
  const files = []
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(jsx?|js)$/.test(f) && !/(strings|unusedTexts)\.js$|\.test\.js$/.test(f)) files.push(p) } }
  walk(root)
  const code = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
  return Object.keys(strings.en).filter((k) => !['ad', 'admin', 'cm'].includes(k.split('.')[0])).filter((k) => {
    if (code.includes(`'${k}'`) || code.includes(`"${k}"`) || code.includes(`\`${k}\``)) return false
    const parts = k.split('.')
    for (let i = parts.length - 1; i > 0; i--) if (code.includes('`' + parts.slice(0, i).join('.') + '.${')) return false // t(`about.${k}`)
    return true
  }).sort()
}

test('the hidden list of unused website texts matches the code', () => {
  assert.deepEqual([...UNUSED_TEXTS].sort(), unusedKeys())
})
