import { useState } from 'react'
import { api } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { forgetSiteImages, reloadSiteImages } from '../lib/site.jsx'
import PhotoPicker from '../components/PhotoPicker.jsx'
import { ImagePicker, Modal, useErrText } from './kit.jsx'
import { RecordPhotoLink } from './StudentsAdmin.jsx'

// For admins, on a student's or alumnus's details page: change each picture right there. Loaded only for admins.
// - the cover at the top and the picture beside the details: the same for every profile page (site pictures)
// - the person's own photo: a member's uploaded photo, or a directory record's photo link

const SLOTS = {
  'profile-cover': ['প্রোফাইল পাতার উপরের ছবি (সব প্রোফাইলে একই)', 'Picture at the top of profile pages (the same on every profile)'],
  'profile-side': ['প্রোফাইল পাতার পাশের ছবি (সব প্রোফাইলে একই)', 'Picture beside the details on profile pages (the same on every profile)'],
}

function EditButton({ label, onClick, className = '' }) {
  return (
    <button type="button" className={`pic-edit ${className}`} onClick={onClick} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      <span>{label}</span>
    </button>
  )
}

// One site picture (cover or side), saved at once; "Use the built-in picture" removes the chosen one.
export function SitePictureEdit({ slot, current, className }) {
  const { pick } = useApp()
  const errText = useErrText()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const save = async (image) => {
    setBusy(true); setMsg(null)
    try {
      await api(`/admin/settings/site-images/page/${slot}`, { method: 'PUT', body: JSON.stringify({ image }) })
      forgetSiteImages(); reloadSiteImages()
      setMsg({ tone: 'ok', text: pick('সংরক্ষণ হয়েছে। সব প্রোফাইল পাতায় এখনই দেখা যাবে।', 'Saved. Every profile page shows it now.') })
    } catch (e) {
      setMsg({ tone: 'bad', text: Object.values(e.fields || {})[0] || errText(e) })
    } finally { setBusy(false) }
  }
  const [bn, en] = SLOTS[slot]
  return (
    <>
      <EditButton className={className} label={pick('ছবি বদলান', 'Change picture')} onClick={() => { setMsg(null); setOpen(true) }} />
      {open && (
        <Modal title={pick(bn, en)} onClose={() => setOpen(false)} busy={busy}>
          <ImagePicker profile="hero" label={pick(bn, en)} value={current ? 'chosen' : ''} url={current || undefined}
            onChange={(m) => save(m ? m.path : '')} hint={pick('ডিভাইস থেকে, লিংক দিয়ে বা গ্যালারি থেকে ছবি দিন। “ছবি সরান” চাপলে আগের নিজস্ব ছবি ফিরে আসে।', 'Use a picture from this device, a link or the gallery. “Remove” brings back the built-in picture.')} />
          <div aria-live="polite">{msg && <p className={`notice ${msg.tone}`}>{msg.text}</p>}</div>
        </Modal>
      )}
    </>
  )
}

// The person's own photo: a registered member's photo (upload, link or gallery) or a directory record's photo link.
export function PersonPhotoEdit({ person, onSaved }) {
  const { pick } = useApp()
  const [open, setOpen] = useState(false)
  const member = person.id.startsWith('m-')
  const uid = member ? person.id.slice(2) : ''
  return (
    <>
      <EditButton className="pic-edit-avatar" label={pick('ছবি বদলান', 'Change photo')} onClick={() => setOpen(true)} />
      {open && (
        <Modal title={`${pick('ছবি বদলান', 'Change photo')}: ${person.name}`} onClose={() => setOpen(false)}>
          {member
            ? <PhotoPicker gallery name={person.name} photo={person.photo} uploadPath={`/admin/students/${uid}/photo`} deletePath={`/admin/students/${uid}/photo`} size={96} onDone={() => onSaved?.()} />
            : <RecordPhotoLink row={{ id: person.id, name: person.name, private: { photoLink: person.photoLink || '' } }} onSaved={onSaved} />}
        </Modal>
      )}
    </>
  )
}
