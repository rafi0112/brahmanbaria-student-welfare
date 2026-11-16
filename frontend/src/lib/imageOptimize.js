import { MAX_SIDE, PROFILES, checkFile, encodeBitmap, pathFor, sha256Hex } from './imageCore.js'

// One place that turns a picture from the admin's computer into the single optimized file that gets stored:
//   validate the file → decode, scale (never enlarged), re-encode (EXIF and anything hidden in the file is dropped)
//   → SHA-256 of the final bytes, which names the stored file. The original is never uploaded.
// Decoding and encoding run in a Web Worker where the browser supports it, on the main thread otherwise.

const fail = (code) => Object.assign(new Error(code), { code })

function inWorker(file, profile) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./imageOptimize.worker.js', import.meta.url), { type: 'module' })
    w.onmessage = ({ data }) => { w.terminate(); if (data.ok) resolve(data); else reject(fail(data.code)) }
    w.onerror = () => { w.terminate(); reject(fail('worker')) }
    w.postMessage({ id: 1, file, profile })
  })
}

async function onMainThread(file, profile) {
  let bitmap
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { throw fail('corrupt') }
  try {
    if (bitmap.width > MAX_SIDE || bitmap.height > MAX_SIDE) throw fail('dimensions')
    return await encodeBitmap(bitmap, profile)
  } finally { bitmap.close?.() }
}

export const canWorker = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined'

// profile: a key of PROFILES. Resolves { blob, width, height, mime, ext, size, originalSize, sha256, path }.
export async function optimizeImage(file, profileName = 'gallery') {
  const bad = checkFile(file)
  if (bad) throw fail(bad)
  const profile = PROFILES[profileName] || PROFILES.gallery
  let out
  try { out = canWorker() ? await inWorker(file, profile) : await onMainThread(file, profile) } catch (e) {
    if (e.code === 'worker') out = await onMainThread(file, profile) // a browser that refuses module workers
    else throw e
  }
  const ext = out.mime === 'image/png' ? '.png' : '.jpg'
  const sha256 = await sha256Hex(out.blob)
  return { blob: out.blob, width: out.width, height: out.height, mime: out.mime, ext, size: out.blob.size, originalSize: file.size, sha256, path: pathFor(sha256, ext) }
}

export { PROFILES, checkFile }
