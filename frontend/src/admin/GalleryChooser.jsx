import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Modal } from './kit.jsx'

// "Choose from the gallery": the pictures already in the site's gallery (shown and hidden ones; archived ones and
// video-only entries are left out), with search and "show more". One picture is chosen with a click; with `multiple`
// several are ticked (their order is the order of ticking) and added together.
//
// Each chosen picture: { image, imageUrl, large, absolute, caption }
//   image     the stored reference, to save in content (a blog cover, an event photo, a place photo, a slide)
//   imageUrl  a small copy for the panel's preview
//   large     a big copy for use inside a text
//   absolute  `large` as a full address, for pickers that take a link (committee and member photos)

const legacy = (ref) => ref && !/\.(jpg|png)$/.test(ref)
export function galleryItem(e, pick) {
  const ref = e.data?.image || ''
  const small = e.data?.imageUrl || (legacy(ref) ? `/images/${ref}-640.webp` : '')
  const large = e.data?.imageUrl || (legacy(ref) ? `/images/${ref}-1280.webp` : '')
  return {
    id: e.id, image: ref, imageUrl: small, large,
    absolute: large ? new URL(large, window.location.origin).href : '',
    caption: (pick(e.data?.captionBn, e.data?.captionEn) || e.data?.alt || '').trim(),
    captionBn: e.data?.captionBn || '', captionEn: e.data?.captionEn || '',
  }
}

export default function GalleryChooser({ multiple = false, max = 24, onPick, onClose, title }) {
  const { t, n, pick } = useApp()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [st, setSt] = useState({ items: [], pages: 1, loading: true, error: '' })
  const [chosen, setChosen] = useState([]) // ids in the order ticked
  const [broken, setBroken] = useState([]) // pictures whose file is missing are not offered

  useEffect(() => { const id = setTimeout(() => { setTerm(q.trim()); setPage(1) }, 300); return () => clearTimeout(id) }, [q])
  useEffect(() => {
    let live = true
    setSt((s) => ({ ...s, loading: true, error: '' }))
    api(`/admin/content/image?limit=60&sort=order&page=${page}${term ? `&q=${encodeURIComponent(term)}` : ''}`)
      .then((d) => {
        if (!live) return
        const fresh = (d.items || []).filter((e) => e.data?.image).map((e) => galleryItem(e, pick)).filter((x) => x.imageUrl)
        setSt((s) => ({ items: page === 1 ? fresh : [...s.items, ...fresh.filter((x) => !s.items.some((y) => y.id === x.id))], pages: d.pages || 1, loading: false, error: '' }))
      })
      .catch(() => live && setSt((s) => ({ ...s, loading: false, error: t('gc.error') })))
    return () => { live = false }
  }, [term, page]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (x) => {
    if (!multiple) { onPick([x]); return }
    setChosen((c) => (c.includes(x.id) ? c.filter((i) => i !== x.id) : c.length < max ? [...c, x.id] : c))
  }
  const done = () => onPick(chosen.map((id) => st.items.find((x) => x.id === id)).filter(Boolean))

  return (
    <Modal title={title || t(multiple ? 'gc.titleMany' : 'gc.title')} onClose={onClose} wide>
      <div className="gc">
        <div className="gc-bar">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('gc.search')} aria-label={t('gc.search')} />
          {multiple && <span className="muted small" aria-live="polite">{t('gc.chosen').replace('{n}', n(chosen.length)).replace('{max}', n(max))}</span>}
        </div>
        {st.error && <p className="notice bad" role="alert">{st.error}</p>}
        {!st.loading && !st.error && st.items.length === 0 && <p className="muted">{t(term ? 'gc.noMatch' : 'gc.empty')}</p>}
        <ul className="gc-grid">
          {st.items.filter((x) => !broken.includes(x.id)).map((x) => {
            const at = chosen.indexOf(x.id)
            return (
              <li key={x.id}>
                <button type="button" className={`gc-item${at >= 0 ? ' is-on' : ''}`} onClick={() => toggle(x)} aria-pressed={multiple ? at >= 0 : undefined}
                  title={x.caption || undefined}>
                  <img src={x.imageUrl} alt={x.caption} loading="lazy" decoding="async" onError={() => setBroken((b) => [...b, x.id])} />
                  {multiple && <span className="gc-tick" aria-hidden="true">{at >= 0 ? n(at + 1) : ''}</span>}
                  {x.caption && <span className="gc-cap">{x.caption}</span>}
                </button>
              </li>
            )
          })}
        </ul>
        {st.loading && <p className="muted small">{t('gc.loading')}</p>}
        {!st.loading && page < st.pages && <div className="gc-more"><button type="button" className="btn btn-outline btn-sm" onClick={() => setPage((p) => p + 1)}>{t('gc.more')}</button></div>}
        {multiple && (
          <div className="gc-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('wb.cancel')}</button>
            <button type="button" className="btn btn-dark" disabled={!chosen.length} onClick={done}>{t('gc.add').replace('{n}', n(chosen.length))}</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
