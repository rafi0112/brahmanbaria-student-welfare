import { useRef, useState } from 'react'
import { uploadVideo } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { checkVideoFile, youtubeId, youtubeThumb } from '../lib/video.js'
import Icon from './icons.jsx'

// Choose a video: upload a file from this device (MP4 or WebM, up to 50 MB) or paste a YouTube link.
// onPick({ video, videoUrl }) for a file once it is stored, onPick({ youtube }) for a YouTube video.
export default function VideoPicker({ onPick, disabled, compact }) {
  const { pick } = useApp()
  const input = useRef(null)
  const [link, setLink] = useState('')
  const [progress, setProgress] = useState(null)
  const [err, setErr] = useState('')
  const busy = progress !== null
  const id = youtubeId(link)
  const MSG = {
    no_video: pick('কোনো ভিডিও বাছা হয়নি।', 'No video was chosen.'),
    video_mov: pick('iPhone-এর .mov ভিডিও সব ব্রাউজারে চলে না। ভিডিওটি MP4 হিসেবে সেভ বা এক্সপোর্ট করে আবার দিন।', 'iPhone .mov videos do not play in every browser. Save or export the video as MP4 and try again.'),
    video_invalid: pick('শুধু MP4 বা WebM ভিডিও চলবে।', 'Only MP4 or WebM videos work.'),
    video_too_big: pick('ভিডিওটি ৫০ MB-এর বেশি। ছোট করে (কম রেজোলিউশন বা ছোট অংশ) আবার দিন, অথবা YouTube-এ রেখে লিংক দিন।', 'The video is over 50 MB. Make it smaller (lower resolution or a shorter part), or put it on YouTube and paste the link.'),
    storage_off: pick('এখানে ভিডিও আপলোড চালু নেই। YouTube লিংক ব্যবহার করুন।', 'Video upload is not available here. Use a YouTube link.'),
    storage_failed: pick('ভিডিও সংরক্ষণ হয়নি। Supabase-এ “site-video” bucket তৈরি আছে কিনা দেখুন (ব্যবহার নির্দেশিকা দেখুন), তারপর আবার চেষ্টা করুন।', 'The video was not stored. Check that the “site-video” bucket exists in Supabase (see the manual), then try again.'),
    rate_limited: pick('অল্প সময়ে অনেক আপলোড হয়েছে। একটু পরে চেষ্টা করুন।', 'Too many uploads in a short time. Try again a little later.'),
    network: pick('ইন্টারনেট সংযোগে সমস্যা। আবার চেষ্টা করুন।', 'Connection problem. Try again.'),
  }
  const choose = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const bad = checkVideoFile(f)
    if (bad) { setErr(MSG[bad]); return }
    setErr(''); setProgress(0)
    try {
      const r = await uploadVideo(f, { onProgress: setProgress })
      onPick({ video: r.path, videoUrl: r.url })
    } catch (ex) { setErr(MSG[ex.message] || MSG[ex.status === 0 ? 'network' : 'storage_failed'] || ex.message) } finally { setProgress(null) }
  }
  return (
    <div className={`vp${compact ? ' is-compact' : ''}`}>
      <div className="vp-row">
        <input ref={input} type="file" accept="video/mp4,video/webm,.mp4,.webm" onChange={choose} hidden />
        <button type="button" className="btn btn-outline btn-sm" disabled={disabled || busy} onClick={() => input.current?.click()}><Icon name="upload" size={15} /> {pick('ভিডিও ফাইল আপলোড', 'Upload a video file')}</button>
        <small className="muted">{pick('MP4 বা WebM, সর্বোচ্চ ৫০ MB', 'MP4 or WebM, up to 50 MB')}</small>
      </div>
      {busy && <div role="status"><progress max="100" value={progress} /> <small>{pick('আপলোড হচ্ছে…', 'Uploading…')} {progress}%</small></div>}
      <div className="vp-row">
        <input className="vp-link" value={link} onChange={(e) => { setLink(e.target.value); setErr('') }} placeholder="https://www.youtube.com/watch?v=…" inputMode="url" aria-label={pick('YouTube ভিডিওর লিংক', 'YouTube video link')} disabled={disabled || busy} />
        <button type="button" className="btn btn-dark btn-sm" disabled={disabled || busy || !id} onClick={() => { onPick({ youtube: id }); setLink('') }}>{pick('YouTube ভিডিও যোগ করুন', 'Add the YouTube video')}</button>
      </div>
      {link.trim() && (id
        ? <p className="vp-ok"><img src={youtubeThumb(id, 'mqdefault')} alt="" width="96" height="54" /> {pick('ঠিক আছে, এই ভিডিওটি যোগ হবে।', 'This video will be added.')}</p>
        : <small className="err" role="alert">{pick('এটি YouTube ভিডিওর লিংক নয়।', 'That is not a YouTube video link.')}</small>)}
      {err && <small className="err" role="alert">{err}</small>}
    </div>
  )
}

// the picture that stands for a slide or gallery entry in the admin lists
export const mediaThumb = (x) => x?.imageUrl || (x?.youtube ? youtubeThumb(x.youtube, 'mqdefault') : '')
