// Videos for the home slides and the gallery: an uploaded file (MP4 or WebM, up to 50 MB) or a YouTube video, which
// is kept as its 11-character id. The same reading of YouTube links as the server (backend/video.go).

const ID = /^[A-Za-z0-9_-]{11}$/
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024
export const VIDEO_TYPES = ['video/mp4', 'video/webm']

export function youtubeId(input) {
  let s = String(input || '').trim()
  if (ID.test(s)) return s
  if (!s.includes('://')) s = `https://${s}`
  let u
  try { u = new URL(s) } catch { return '' }
  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '')
  const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/')
  let id = ''
  if (host === 'youtu.be') id = parts[0]
  else if (['youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    id = u.searchParams.get('v') || (['shorts', 'embed', 'live', 'v'].includes(parts[0]) ? parts[1] || '' : '')
  }
  return ID.test(id) ? id : ''
}

export const youtubeThumb = (id, size = 'hqdefault') => (id ? `https://i.ytimg.com/vi/${id}/${size}.jpg` : '')

// the privacy-enhanced player; `background` plays silently on a loop with no controls (the home slides)
export function youtubeEmbed(id, { background = false, autoplay = false } = {}) {
  const p = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' })
  if (background) { p.set('autoplay', '1'); p.set('mute', '1'); p.set('controls', '0'); p.set('loop', '1'); p.set('playlist', id); p.set('disablekb', '1'); p.set('iv_load_policy', '3') }
  else if (autoplay) p.set('autoplay', '1')
  return `https://www.youtube-nocookie.com/embed/${id}?${p}`
}

// "" when the file can be uploaded, otherwise an error code the panel explains
export function checkVideoFile(file) {
  if (!file) return 'no_video'
  if (/\.mov$/i.test(file.name) || file.type === 'video/quicktime') return 'video_mov'
  if (!VIDEO_TYPES.includes(file.type) && !/\.(mp4|webm)$/i.test(file.name)) return 'video_invalid'
  if (file.size > MAX_VIDEO_BYTES) return 'video_too_big'
  return ''
}
