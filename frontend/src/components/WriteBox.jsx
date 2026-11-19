import { useRef, useState } from 'react'
import { useApp } from '../lib/app.jsx'
import { continueList, insertBlock, isWebLink, link, prefixLines, readMinutes, wordCount, wrap } from '../lib/writeOps.js'
import Markdown from './Markdown.jsx'

// The box for writing a blog post, for admins and for members. Buttons do the formatting (heading, bold, lists,
// quote, link, picture, divider); "Preview" shows it exactly as the site will. Underneath it is plain Markdown, so
// nothing hidden is stored and pasted pages or scripts stay plain text.
// Keys: Ctrl/⌘+B bold, Ctrl/⌘+I italic, Ctrl/⌘+K link; Enter in a list starts the next item.
//
// onPicture(file) → Promise<url>: when given, a "Picture" button uploads one and puts it in the text where the
// cursor is, with its caption. Without it (members send pictures separately) the button is not shown.

export default function WriteBox({ id, value, onChange, rows = 14, maxLength, lang, invalid, describedBy, onPicture, placeholder }) {
  const { t, n } = useApp()
  const area = useRef(null)
  const file = useRef(null)
  const [tab, setTab] = useState('write')
  const [big, setBig] = useState(false)
  const [help, setHelp] = useState(false)
  const [linkBox, setLinkBox] = useState(null) // { url, words, a, b }
  const [picBusy, setPicBusy] = useState(false)
  const [picErr, setPicErr] = useState('')

  // Applies an edit through the browser, so Undo (Ctrl+Z) still works; falls back to setting the text.
  const apply = (r) => {
    const el = area.current
    if (!el || !r) return
    el.focus()
    el.setSelectionRange(r.from, r.to)
    let done = false
    try { done = document.execCommand('insertText', false, r.text) } catch { done = false }
    if (!done || el.value !== value.slice(0, r.from) + r.text + value.slice(r.to)) {
      onChange(value.slice(0, r.from) + r.text + value.slice(r.to))
    }
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.selA, r.selB) })
  }
  const sel = () => [area.current?.selectionStart ?? value.length, area.current?.selectionEnd ?? value.length]
  const run = (f) => () => { if (tab !== 'write') setTab('write'); requestAnimationFrame(() => { const [a, b] = sel(); apply(f(a, b)) }) }

  const openLink = () => {
    const [a, b] = sel()
    setLinkBox({ url: 'https://', words: value.slice(a, b), a, b })
  }
  const addLink = (e) => {
    e.preventDefault()
    if (!isWebLink(linkBox.url)) return
    const { a, b, url, words } = linkBox
    setLinkBox(null)
    requestAnimationFrame(() => apply(link(value, a, b, url.trim(), words.trim())))
  }
  const addPicture = async (f) => {
    if (!f) return
    const [a, b] = sel()
    setPicBusy(true); setPicErr('')
    try {
      const url = await onPicture(f)
      const caption = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/[[\]]/g, '').trim()
      apply(insertBlock(value, a, b, `![${caption}](${url})`))
    } catch { setPicErr(t('wb.picFail')) } finally { setPicBusy(false) }
  }

  const onKey = (e) => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase()
      if (k === 'b') { e.preventDefault(); run((a, b) => wrap(value, a, b, '**', '**', t('wb.sampleBold')))() }
      else if (k === 'i') { e.preventDefault(); run((a, b) => wrap(value, a, b, '*', '*', t('wb.sampleItalic')))() }
      else if (k === 'k') { e.preventDefault(); openLink() }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      const [a, b] = sel()
      const r = continueList(value, a, b)
      if (r) { e.preventDefault(); apply(r) }
    }
  }
  const onPaste = (e) => { // a web address pasted over selected words makes them a link
    const [a, b] = sel()
    const text = e.clipboardData?.getData('text/plain') || ''
    if (b > a && isWebLink(text)) { e.preventDefault(); apply(link(value, a, b, text.trim())) }
  }

  const words = wordCount(value)
  const tools = [
    { k: 'h2', label: t('wb.heading'), show: 'H', fn: (a, b) => prefixLines(value, a, b, 'h2', t('wb.sampleHeading')) },
    { k: 'h3', label: t('wb.subheading'), show: 'h', fn: (a, b) => prefixLines(value, a, b, 'h3', t('wb.sampleHeading')) },
    { sep: true },
    { k: 'b', label: `${t('wb.bold')} (Ctrl+B)`, show: <b>B</b>, fn: (a, b) => wrap(value, a, b, '**', '**', t('wb.sampleBold')) },
    { k: 'i', label: `${t('wb.italic')} (Ctrl+I)`, show: <i>I</i>, fn: (a, b) => wrap(value, a, b, '*', '*', t('wb.sampleItalic')) },
    { sep: true },
    { k: 'ul', label: t('wb.list'), show: <ListIcon />, fn: (a, b) => prefixLines(value, a, b, 'ul', t('wb.sampleItem')) },
    { k: 'ol', label: t('wb.numbered'), show: <NumIcon />, fn: (a, b) => prefixLines(value, a, b, 'ol', t('wb.sampleItem')) },
    { k: 'quote', label: t('wb.quote'), show: <QuoteIcon />, fn: (a, b) => prefixLines(value, a, b, 'quote', t('wb.sampleQuote')) },
    { sep: true },
    { k: 'link', label: `${t('wb.link')} (Ctrl+K)`, show: <LinkIcon />, click: openLink },
    ...(onPicture ? [{ k: 'pic', label: t('wb.picture'), show: <PicIcon />, click: () => file.current?.click(), busy: picBusy }] : []),
    { k: 'hr', label: t('wb.divider'), show: '—', fn: (a, b) => insertBlock(value, a, b, '---') },
  ]

  return (
    <div className={`wb ${big ? 'wb-big' : ''} ${invalid ? 'is-invalid' : ''}`}>
      <div className="wb-top">
        <div className="wb-tabs" role="tablist" aria-label={t('wb.mode')}>
          <button type="button" role="tab" aria-selected={tab === 'write'} className={tab === 'write' ? 'on' : ''} onClick={() => setTab('write')}>{t('wb.write')}</button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>{t('wb.preview')}</button>
        </div>
        <div className="wb-tools" role="toolbar" aria-label={t('wb.tools')}>
          {tools.map((x, i) => x.sep
            ? <span key={`s${i}`} className="wb-sep" aria-hidden="true" />
            : <button key={x.k} type="button" className="wb-btn" title={x.label} aria-label={x.label} disabled={x.busy} aria-busy={x.busy || undefined}
                onMouseDown={(e) => e.preventDefault()} onClick={x.click || run(x.fn)}>{x.busy ? '…' : x.show}</button>)}
        </div>
        <div className="wb-right">
          <button type="button" className="wb-btn wb-txt" aria-pressed={big} onClick={() => setBig((v) => !v)} title={t('wb.bigHint')}>{big ? t('wb.small') : t('wb.big')}</button>
          <button type="button" className="wb-btn wb-txt" aria-expanded={help} onClick={() => setHelp((v) => !v)}>{t('wb.help')}</button>
        </div>
      </div>

      {linkBox && (
        <form className="wb-link" onSubmit={addLink}>
          <label><span>{t('wb.linkUrl')}</span><input autoFocus type="url" value={linkBox.url} onChange={(e) => setLinkBox({ ...linkBox, url: e.target.value })} aria-invalid={linkBox.url.length > 8 && !isWebLink(linkBox.url)} /></label>
          <label><span>{t('wb.linkWords')}</span><input value={linkBox.words} onChange={(e) => setLinkBox({ ...linkBox, words: e.target.value })} placeholder={t('wb.linkWordsP')} /></label>
          <div className="wb-link-btns">
            <button type="submit" className="btn btn-dark btn-sm" disabled={!isWebLink(linkBox.url)}>{t('wb.linkAdd')}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinkBox(null)}>{t('wb.cancel')}</button>
          </div>
        </form>
      )}

      {help && (
        <div className="wb-help">
          <p>{t('wb.helpLead')}</p>
          <ul>
            <li><code>## …</code> {t('wb.heading')}</li><li><code>**…**</code> {t('wb.bold')}</li><li><code>*…*</code> {t('wb.italic')}</li>
            <li><code>- …</code> {t('wb.list')}</li><li><code>1. …</code> {t('wb.numbered')}</li><li><code>&gt; …</code> {t('wb.quote')}</li>
            <li><code>[…](https://…)</code> {t('wb.link')}</li><li><code>---</code> {t('wb.divider')}</li>
          </ul>
          <p className="muted">{t('wb.helpTail')}</p>
        </div>
      )}

      <textarea id={id} ref={area} className="wb-area" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} onPaste={onPaste}
        maxLength={maxLength} lang={lang} aria-invalid={invalid || undefined} aria-describedby={describedBy} placeholder={placeholder} hidden={tab !== 'write'} spellCheck />
      {tab === 'preview' && (
        <div className="wb-preview prose" role="tabpanel" aria-label={t('wb.preview')}>
          {value.trim() ? <Markdown text={value} /> : <p className="muted">{t('wb.nothing')}</p>}
        </div>
      )}
      {onPicture && <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { addPicture(e.target.files?.[0]); e.target.value = '' }} />}

      <div className="wb-foot">
        <span>{t('wb.words').replace('{n}', n(words))} · {t('wb.minutes').replace('{n}', n(readMinutes(words)))}</span>
        {maxLength && <span className="wb-count">{n(value.length)} / {n(maxLength)}</span>}
      </div>
      {picErr && <small className="err" role="alert">{picErr}</small>}
    </div>
  )
}

const Svg = ({ d }) => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const ListIcon = () => <Svg d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
const NumIcon = () => <Svg d="M10 6h10M10 12h10M10 18h10M4 5h1.5v4M4 9h3M4 14.5c.4-.6 1-.9 1.6-.9.8 0 1.4.5 1.4 1.2 0 1.3-3 2.1-3 3.2h3" />
const QuoteIcon = () => <Svg d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6" />
const LinkIcon = () => <Svg d="M10 14a4.5 4.5 0 0 0 6.4 0l2.6-2.6a4.5 4.5 0 0 0-6.4-6.4L11.5 6M14 10a4.5 4.5 0 0 0-6.4 0L5 12.6A4.5 4.5 0 0 0 11.4 19l1.1-1" />
const PicIcon = () => <Svg d="M4 5h16v14H4zM4 16l4.5-4.5 4 4L15 13l5 5M15.5 9.5h.01" />
