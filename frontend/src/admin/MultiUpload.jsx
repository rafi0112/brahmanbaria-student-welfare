import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/app.jsx'
import { INPUT_TYPES, MAX_ORIGINAL, checkFile, formatBytes } from '../lib/imageCore.js'
import { optimizeImage } from '../lib/imageOptimize.js'
import { storeOptimized, withRetry } from '../lib/mediaUpload.js'
import { Modal, useErrText } from './kit.jsx'

const CONCURRENCY = 3
const MAX_QUEUE = 100 // a usability and memory safeguard, not a size limit: more can be added after a batch is done
const RUNNING = ['optimizing', 'checking', 'uploading', 'saving']
const key = (f) => `${f.name}|${f.size}|${f.lastModified}`

// Choose many pictures at once (and more later without losing the ones already chosen), see a preview of each, remove the
// ones you do not want, then upload them together. Every picture is optimized in the browser, stored once (a picture that
// is already stored anywhere on the site is reused, not uploaded again) and handed to onStored, which saves it where it
// belongs (for the Gallery: one new entry per picture).
export default function MultiUpload({ profile = 'gallery', title, onStored, onClose, onFinished }) {
  const { pick, n } = useApp()
  const errText = useErrText()
  const input = useRef(null)
  const [items, setItems] = useState([])
  const [running, setRunning] = useState(false)
  const [note, setNote] = useState('')
  const seen = useRef(new Map()) // SHA-256 → the item that carries it in this batch
  const live = useRef(items)
  live.current = items
  const previews = useRef(new Map())

  const patch = useCallback((id, p) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x))), [])
  useEffect(() => { const m = previews.current; return () => m.forEach((u) => URL.revokeObjectURL(u)) }, [])

  const add = (files) => {
    const have = new Set(live.current.map((x) => key(x.file)))
    const fresh = []
    let rejected = 0
    let dup = 0
    for (const file of files) {
      if (have.has(key(file))) { dup++; continue }
      have.add(key(file))
      const bad = checkFile(file)
      if (bad) rejected++
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      if (!bad) previews.current.set(id, URL.createObjectURL(file))
      fresh.push({ id, file, preview: previews.current.get(id) || '', status: bad ? 'rejected' : 'ready', progress: 0, error: bad ? errText({ code: bad }) : '' })
    }
    const room = MAX_QUEUE - live.current.filter((x) => x.status !== 'done').length
    const take = fresh.filter((x) => x.status === 'rejected').concat(fresh.filter((x) => x.status !== 'rejected').slice(0, Math.max(0, room)))
    const cut = fresh.length - take.length
    setItems((list) => [...list.filter((x) => x.status !== 'done'), ...take])
    setNote([rejected ? pick(`${n(rejected)}টি ফাইল বাদ গেছে।`, `${rejected} file${rejected > 1 ? 's were' : ' was'} skipped.`) : '',
      dup ? pick(`${n(dup)}টি আগেই বাছা ছিল।`, `${dup} already chosen.`) : '',
      cut ? pick(`একবারে সর্বোচ্চ ${n(MAX_QUEUE)}টি; বাকিগুলো এই ব্যাচ শেষ হলে যোগ করুন।`, `At most ${MAX_QUEUE} at a time; add the rest when this batch is done.`) : ''].filter(Boolean).join(' '))
  }
  const onPick = (e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) add(files) }
  const remove = (id) => {
    const u = previews.current.get(id)
    if (u) { URL.revokeObjectURL(u); previews.current.delete(id) }
    setItems((list) => list.filter((x) => x.id !== id))
  }

  const process = useCallback(async (item) => {
    patch(item.id, { status: 'optimizing', progress: 5, error: '' })
    try {
      const opt = await optimizeImage(item.file, profile)
      patch(item.id, { size: opt.size, width: opt.width, height: opt.height, sha: opt.sha256, progress: 20 })
      const owner = seen.current.get(opt.sha256)
      if (owner && owner !== item.id) { patch(item.id, { status: 'skipped', progress: 100 }); return } // the same picture twice in one batch
      seen.current.set(opt.sha256, item.id)
      let stored
      try {
        stored = await storeOptimized(opt, { onStage: (s, p) => patch(item.id, { status: s === 'done' ? 'saving' : s, progress: Math.max(20, p) }) })
        patch(item.id, { status: 'saving', progress: 90, reused: stored.reused })
        await withRetry(() => onStored({ ...stored, file: item.file, opt }), { onRetry: () => patch(item.id, { retrying: true }) })
      } catch (e) { seen.current.delete(opt.sha256); throw e }
      patch(item.id, { status: 'done', progress: 100, retrying: false })
    } catch (e) { patch(item.id, { status: 'failed', error: errText(e), retrying: false }) }
  }, [onStored, patch, profile, errText])

  const start = async () => {
    if (running) return // never two runs at once
    const todo = live.current.filter((x) => x.status === 'ready' || x.status === 'failed')
    if (!todo.length) return
    setRunning(true)
    const queue = [...todo]
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) await process(queue.shift())
    }))
    setRunning(false)
    onFinished?.()
  }

  const usable = items.filter((x) => x.status !== 'rejected')
  const done = items.filter((x) => x.status === 'done').length
  const failed = items.filter((x) => x.status === 'failed').length
  const waiting = items.filter((x) => x.status === 'ready' || x.status === 'failed').length
  const total = usable.reduce((s, x) => s + (x.progress || 0), 0)
  const pct = usable.length ? Math.round(total / usable.length) : 0
  const before = items.reduce((s, x) => s + (x.size ? x.file.size : 0), 0)
  const after = items.reduce((s, x) => s + (x.size || 0), 0)
  const reused = items.filter((x) => x.reused).length
  const label = { ready: pick('অপেক্ষায়', 'Ready'), optimizing: pick('ছোট করা হচ্ছে…', 'Optimizing…'), checking: pick('যাচাই হচ্ছে…', 'Checking…'), uploading: pick('আপলোড হচ্ছে…', 'Uploading…'), saving: pick('সংরক্ষণ হচ্ছে…', 'Saving…'), done: pick('হয়ে গেছে', 'Done'), failed: pick('হয়নি', 'Failed'), skipped: pick('একই ছবি ব্যাচে আগেই আছে — বাদ', 'Same picture is already in this batch — skipped'), rejected: pick('বাদ', 'Skipped') }

  return (
    <Modal title={title || pick('একসাথে অনেক ছবি আপলোড', 'Upload several pictures')} onClose={onClose} wide busy={running}>
      <div className="mu">
        <input ref={input} type="file" multiple accept={INPUT_TYPES.join(',')} onChange={onPick} hidden />
        <div className="mu-bar row">
          <button type="button" className="btn btn-outline btn-sm" disabled={running} onClick={() => input.current?.click()}>+ {pick(items.length ? 'আরও ছবি যোগ করুন' : 'ছবি বাছুন', items.length ? 'Add more pictures' : 'Choose pictures')}</button>
          <button type="button" className="btn btn-dark btn-sm" disabled={running || waiting === 0} onClick={start}>
            {running ? pick('আপলোড হচ্ছে…', 'Uploading…') : failed && waiting === failed ? pick('আবার চেষ্টা করুন', 'Retry failed') : pick(`${n(waiting)}টি ছবি আপলোড করুন`, `Upload ${waiting} picture${waiting === 1 ? '' : 's'}`)}
          </button>
        </div>
        <p className="muted small">{pick(`প্রতিটি ছবি ${formatBytes(MAX_ORIGINAL)} পর্যন্ত। ছবি ব্রাউজারেই ছোট করে একবার সংরক্ষণ হয়; সাইটে আগে থেকে থাকা ছবি আবার আপলোড হয় না।`, `Each picture up to ${formatBytes(MAX_ORIGINAL)}. Pictures are optimized in your browser and stored once; a picture the site already has is not uploaded again.`)}</p>
        {note && <p className="muted small" role="status">{note}</p>}

        {items.length > 0 && (
          <>
            <div className="mu-total" role="status" aria-live="polite">
              <progress max="100" value={pct} aria-label={pick('মোট অগ্রগতি', 'Total progress')} />
              <small>{pick(`${n(done)}/${n(usable.length)} হয়েছে`, `${done} of ${usable.length} done`)}{failed ? pick(` · ${n(failed)}টি হয়নি`, ` · ${failed} failed`) : ''}{reused ? pick(` · ${n(reused)}টি আগে থেকেই ছিল (নতুন জায়গা লাগেনি)`, ` · ${reused} already stored (no new space used)`) : ''}</small>
              {after > 0 && <small className="muted">{pick(`মূল ${formatBytes(before)} → সংরক্ষিত ${formatBytes(after)}`, `Originals ${formatBytes(before)} → stored ${formatBytes(after)}`)}</small>}
            </div>
            <ul className="mu-list">
              {items.map((it) => (
                <li key={it.id} className={`mu-item is-${it.status}`}>
                  {it.preview ? <img src={it.preview} alt="" loading="lazy" decoding="async" width="56" height="56" /> : <span className="mu-noimg" aria-hidden="true" />}
                  <div className="mu-info">
                    <span className="mu-name" title={it.file.name}>{it.file.name}</span>
                    <small className="muted">{formatBytes(it.file.size)}{it.size ? ` → ${formatBytes(it.size)}${it.width ? ` · ${it.width}×${it.height}` : ''}` : ''}</small>
                    {RUNNING.includes(it.status) && <progress max="100" value={it.progress} aria-label={it.file.name} />}
                    <small className={it.status === 'failed' || it.status === 'rejected' ? 'err' : 'muted'}>
                      {it.status === 'done' && it.reused ? pick('আগে থেকেই সংরক্ষিত — আবার আপলোড হয়নি', 'Already stored — not uploaded again') : label[it.status]}{it.retrying ? pick(' (সার্ভার জাগছে, আবার চেষ্টা চলছে)', ' (server is waking up, retrying)') : ''}{it.error ? `: ${it.error}` : ''}
                    </small>
                  </div>
                  {!RUNNING.includes(it.status) && it.status !== 'done' && <button type="button" className="ad-iconbtn is-danger" disabled={running && it.status === 'ready'} onClick={() => remove(it.id)} aria-label={pick('বাদ দিন', 'Remove')}>✕</button>}
                </li>
              ))}
            </ul>
          </>
        )}
        {!running && done > 0 && waiting === 0 && <div className="row"><button type="button" className="btn btn-dark btn-sm" onClick={onClose}>{pick('শেষ', 'Finish')}</button></div>}
      </div>
    </Modal>
  )
}
