import { useRef, useState } from 'react'
import { api, sendPhoto, sendPhotoLink } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Avatar } from './ui.jsx'

const TYPES = ['image/jpeg', 'image/png']
const MAX = 5 * 1024 * 1024

// Shows a person's photo with a public-link field first (the recommended way), a file upload as the alternative, and
// "Remove". Used for one's own profile and by admins for a member.
// The server validates and re-encodes the file; the client only refuses obviously wrong files early.
export default function PhotoPicker({ name, photo, uploadPath, deletePath, onDone, size = 96 }) {
  const { t } = useApp()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [link, setLink] = useState('')
  const fromLink = async () => {
    const l = link.trim()
    if (!/^https:\/\/\S+$/.test(l)) { setErr(t('photo.e.link')); return }
    setBusy(true); setErr('')
    try { onDone(await sendPhotoLink(uploadPath, l), 'set'); setLink('') }
    catch (x) { setErr(t(x.message === 'drive_not_public' ? 'photo.e.drive' : x.status === 429 ? 'auth.rateLimited' : 'photo.e.linkBad')) }
    finally { setBusy(false) }
  }
  const pick = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!TYPES.includes(f.type)) { setErr(t('photo.e.type')); return }
    if (f.size > MAX) { setErr(t('photo.e.size')); return }
    setBusy(true); setErr('')
    try { onDone(await sendPhoto(uploadPath, f), 'set') }
    catch (x) { setErr(t(x.status === 413 ? 'photo.e.size' : x.status === 429 ? 'auth.rateLimited' : x.message === 'photo_dimensions' ? 'photo.e.dims' : 'photo.e.bad')) }
    finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true); setErr('')
    try { onDone(await api(deletePath, { method: 'DELETE' }), 'removed') } catch { setErr(t('photo.e.bad')) } finally { setBusy(false) }
  }
  return (
    <div className="photo-pick">
      <Avatar name={name} photo={photo} size={size} className="photo-pick-img" />
      <div className="photo-pick-actions">
        {/* a public link is the recommended way; a file from the device is the fallback */}
        <span className="photo-link">
          <span className="photo-rec">{t('photo.recommended')}</span>
          <input type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder={t('photo.linkPh')} aria-label={t('photo.linkLabel')} disabled={busy}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fromLink() } }} />
          <button type="button" className="btn btn-dark btn-sm" disabled={busy || !link.trim()} onClick={fromLink}>{t('photo.useLink')}</button>
        </span>
        <span className="photo-alt">
          <input ref={input} type="file" accept="image/jpeg,image/png" hidden onChange={pick} />
          <button type="button" className="btn-link" disabled={busy} aria-busy={busy || undefined} onClick={() => input.current?.click()}>{t(photo ? 'photo.change' : 'photo.upload')}</button>
          {photo && <button type="button" className="btn-link is-danger" disabled={busy} onClick={remove}>{t('photo.remove')}</button>}
        </span>
        <small className="muted">{t('photo.hint')}</small>
        {err && <small className="err" role="alert">{err}</small>}
      </div>
    </div>
  )
}
