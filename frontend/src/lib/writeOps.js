// Text edits for the writing box (Markdown under the hood, buttons on top). Each returns the part of the text to
// replace ({ from, to, text }) and where the selection goes after ({ selA, selB }), so the box can apply it the way
// the browser keeps Undo working. Blocks (headings, lists, quotes) always stand apart with a blank line, which is what
// the renderer needs.

// **bold**, *italic*: wraps the selection; with nothing selected it inserts a sample word, selected, to type over.
export function wrap(value, a, b, before, after, sample) {
  const chosen = value.slice(a, b) || sample
  // already wrapped: unwrap
  if (value.slice(a - before.length, a) === before && value.slice(b, b + after.length) === after && b > a) {
    return { from: a - before.length, to: b + after.length, text: chosen, selA: a - before.length, selB: a - before.length + chosen.length }
  }
  return { from: a, to: b, text: before + chosen + after, selA: a + before.length, selB: a + before.length + chosen.length }
}

const lineStart = (v, i) => v.lastIndexOf('\n', i - 1) + 1
const lineEnd = (v, i) => { const e = v.indexOf('\n', i); return e < 0 ? v.length : e }

// Blank lines around a block so it is a block of its own.
function padded(value, from, to, block) {
  const pre = value.slice(0, from)
  const post = value.slice(to)
  const lead = pre === '' || pre.endsWith('\n\n') ? '' : pre.endsWith('\n') ? '\n' : '\n\n'
  const tail = post === '' || post.startsWith('\n\n') ? '' : post.startsWith('\n') ? '\n' : '\n\n'
  return { lead, tail, text: lead + block + tail }
}

// "## ", "- ", "1. ", "> " at the start of every selected line; pressing again removes it.
export function prefixLines(value, a, b, kind, sample = '') {
  const from = lineStart(value, a)
  const to = lineEnd(value, Math.max(a, b - (b > a && value[b - 1] === '\n' ? 1 : 0)))
  let lines = value.slice(from, to).split('\n')
  if (lines.length === 1 && lines[0].trim() === '') lines = [sample]
  const rx = { h2: /^##\s+/, h3: /^###\s+/, ul: /^[-*]\s+/, ol: /^\d+[.)]\s+/, quote: /^>\s?/ }[kind]
  const mark = (i) => ({ h2: '## ', h3: '### ', ul: '- ', ol: `${i + 1}. `, quote: '> ' }[kind])
  const strip = (l) => l.replace(/^(#{1,3}\s+|[-*]\s+|\d+[.)]\s+|>\s?)/, '')
  const all = lines.every((l) => rx.test(l))
  const heading = kind === 'h2' || kind === 'h3'
  const next = all ? lines.map(strip) : (heading ? [mark(0) + strip(lines.join(' '))] : lines.map((l, i) => mark(i) + strip(l)))
  const block = next.join('\n')
  if (all) return { from, to, text: block, selA: from, selB: from + block.length }
  const p = padded(value, from, to, block)
  const start = from + p.lead.length
  // select the words, not the marks, when it was a sample to type over
  const firstMark = heading ? mark(0).length : mark(0).length
  const selA = lines.length === 1 ? start + firstMark : start
  return { from, to, text: p.text, selA, selB: start + block.length }
}

// A picture or a divider: its own block at the cursor.
export function insertBlock(value, a, b, block) {
  const p = padded(value, a, b, block)
  return { from: a, to: b, text: p.text, selA: a + p.text.length, selB: a + p.text.length }
}

// [words](https://…)
export function link(value, a, b, url, words) {
  const text = `[${(words || value.slice(a, b) || url).replace(/[[\]]/g, '')}](${url})`
  return { from: a, to: b, text, selA: a + text.length, selB: a + text.length }
}

// Enter inside a list or a quote: the next line gets the next mark; Enter on an empty item ends the list.
// Returns null when Enter should work as usual.
export function continueList(value, a, b) {
  if (a !== b) return null
  const from = lineStart(value, a)
  const line = value.slice(from, a)
  const m = /^([-*]|\d+[.)]|>)(\s+)(.*)$/.exec(line)
  if (!m || lineEnd(value, a) !== a) return null
  if (m[3].trim() === '') return { from, to: a, text: '', selA: from, selB: from } // an empty item: leave the list
  const num = /^\d+/.exec(m[1])
  const mark = num ? `${Number(num[0]) + 1}${m[1].slice(num[0].length)}` : m[1]
  const text = `\n${mark}${m[2]}`
  return { from: a, to: a, text, selA: a + text.length, selB: a + text.length }
}

export function wordCount(text) {
  return (String(text || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').match(/[\p{L}\p{M}\p{N}]+/gu) || []).length
}

export const readMinutes = (words) => Math.max(1, Math.round(words / 200))

export const isWebLink = (s) => /^https?:\/\/[^\s)]+\.[^\s)]+$/i.test(String(s || '').trim())
