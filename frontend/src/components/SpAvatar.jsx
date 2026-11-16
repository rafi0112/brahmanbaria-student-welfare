import { useState } from 'react'
import { usePhoto } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { initials } from '../lib/initials.js'
import PhotoViewer from './PhotoViewer.jsx'

// The profile picture. With a photo it is a button: a click opens the full-screen viewer, where it can be zoomed.
export default function SpAvatar({ name, photo }) {
  const { pick } = useApp()
  const src = usePhoto(photo)
  const [open, setOpen] = useState(false)
  if (!src) return <span className="sp-avatar" aria-hidden="true">{initials(name)}</span>
  return (
    <>
      <button type="button" className="sp-avatar sp-zoomable" onClick={() => setOpen(true)} aria-label={`${pick('ছবি বড় করে দেখুন', 'View the photo larger')}: ${name}`}>
        <img src={src} alt="" /><span className="sp-zoom-ic" aria-hidden="true">⤢</span>
      </button>
      {open && <PhotoViewer src={src} alt={name} onClose={() => setOpen(false)} />}
    </>
  )
}
