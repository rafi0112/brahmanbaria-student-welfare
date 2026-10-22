// Splits Markdown source into blocks (paragraphs, lists, headings...) separated by blank lines.
export function blocks(text) {
  return String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
}
