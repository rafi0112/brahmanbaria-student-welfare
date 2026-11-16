// The pure parts of picture optimizing, shared by the web worker and the main-thread fallback (and unit-tested).
// Output is JPEG, or PNG when a picture really has transparency: those are the types the site-media bucket accepts.

export const MAX_ORIGINAL = 15 * 1024 * 1024 // what an admin may pick
export const MAX_OPTIMIZED = 2 * 1024 * 1024 // what is ever stored, however large the profile
export const MAX_SIDE = 12000 // a longer side than this is refused (it would not fit in browser memory)
export const INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// maximum longer side in pixels, and the size a result should reach when that is possible without hurting the picture
export const PROFILES = {
  avatar: { max: 400, target: 100 * 1024 },
  blog: { max: 800, target: 250 * 1024 },
  gallery: { max: 1280, target: 600 * 1024 },
  heritage: { max: 1600, target: 900 * 1024 },
  event: { max: 1600, target: 900 * 1024 },
  hero: { max: 1920, target: 1500 * 1024 },
}

// Why a file is refused. SVG can carry scripts and GIF may be animated; neither is converted to a still picture.
export function checkFile(file) {
  if (!file || !file.size) return 'empty'
  if (file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name || '')) return 'svg'
  if (file.type === 'image/gif' || /\.gif$/i.test(file.name || '')) return 'gif'
  if (!INPUT_TYPES.includes(file.type)) return 'type'
  if (file.size > MAX_ORIGINAL) return 'too_big'
  return ''
}

// scale a picture down so that its longer side is at most max pixels; a smaller picture is never enlarged
export function fitWithin(w, h, max) {
  const longest = Math.max(w, h)
  if (longest <= max) return { w, h }
  const k = max / longest
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

// the name a stored picture gets: its SHA-256 shaped like a UUID (the same shape the server uses), so one picture is
// always one file, whoever uploads it and whatever it was called on their computer
export function pathFor(sha256, ext) {
  const h = sha256.slice(0, 32)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}${ext}`
}

export async function sha256Hex(blob) {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const formatBytes = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function hasAlpha(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true
  return false
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h)
    return { ctx: c.getContext('2d', { willReadFrequently: true }), blob: (type, q) => c.convertToBlob({ type, quality: q }) }
  }
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return { ctx: c.getContext('2d', { willReadFrequently: true }), blob: (type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), type, q)) }
}

// Draws the decoded picture at its final size and encodes it. Adaptive: quality drops step by step only while the result
// is above the profile's target and the picture can still look good; a result slightly above the target is kept rather
// than ruining the picture. Anything above the hard 2 MB cap is shrunk further.
export async function encodeBitmap(bitmap, profile) {
  let { w, h } = fitWithin(bitmap.width, bitmap.height, profile.max)
  let last = null
  for (let round = 0; round < 5; round++) {
    const { ctx, blob } = makeCanvas(w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    const alpha = round === 0 ? hasAlpha(ctx, w, h) : last.alpha
    let out
    if (alpha) {
      out = await blob('image/png')
    } else {
      let q = 0.86
      out = await blob('image/jpeg', q)
      while (out.size > profile.target && q > 0.62) { q = Math.round((q - 0.08) * 100) / 100; out = await blob('image/jpeg', q) }
    }
    last = { blob: out, width: w, height: h, mime: out.type || (alpha ? 'image/png' : 'image/jpeg'), alpha }
    if (out.size <= MAX_OPTIMIZED && (!alpha || out.size <= Math.max(profile.target, MAX_OPTIMIZED / 2) || round >= 2)) break
    w = Math.max(1, Math.round(w * 0.85)); h = Math.max(1, Math.round(h * 0.85))
  }
  if (last.blob.size > MAX_OPTIMIZED) throw Object.assign(new Error('too_big_after'), { code: 'too_big_after' })
  return last
}
