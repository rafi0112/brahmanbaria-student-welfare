// A small, safe Markdown renderer for blog posts. It builds React elements (never HTML strings), so pasted
// scripts or tags are shown as plain text. Supported: # headings, - and 1. lists, > quotes, **bold**, *italic*,
// `code` and [text](https://link) (http/https only).
import { blocks } from '../lib/markdownBlocks.js'

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g

function inline(text, keyBase) {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyBase}-${i}`
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={key}>{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={key}>{part.slice(1, -1)}</em>
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part)
    if (link) return <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer nofollow">{link[1]}</a>
    return part
  })
}


export default function Markdown({ text }) {
  return blocks(text).map((block, i) => {
    const lines = block.split('\n')
    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0])
    if (heading && lines.length === 1) {
      const Tag = heading[1].length === 1 ? 'h2' : 'h3'
      return <Tag key={i}>{inline(heading[2], i)}</Tag>
    }
    if (lines.every((l) => /^[-*]\s+/.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^[-*]\s+/, ''), `${i}-${j}`)}</li>)}</ul>
    if (lines.every((l) => /^\d+[.)]\s+/.test(l))) return <ol key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+[.)]\s+/, ''), `${i}-${j}`)}</li>)}</ol>
    if (lines.every((l) => /^>\s?/.test(l))) return <blockquote key={i}>{inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' '), i)}</blockquote>
    return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l, `${i}-${j}`)}</span>)}</p>
  })
}
