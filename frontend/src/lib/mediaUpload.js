import { supabase } from './supabase.js'
import { uploadMedia } from './api.js'
import { optimizeImage } from './imageOptimize.js'

// Stores one optimized picture exactly once.
//
// Direct path (works while the API server is asleep): reserve the picture's SHA-256 in the shared media registry with a
// database function, upload the file to Supabase Storage only if the registry says nobody has, then mark it ready. The
// same picture picked again — in the Gallery, a blog post, an event, by anyone — comes back as already stored and nothing
// is uploaded. The functions and the storage policy only let verified admins in.
//
// Fallback: when the registry is not set up yet (or Storage refuses), the API server's upload endpoint is used. It names
// files after their content too, so a repeated picture is still one file.

const BUCKET = 'site-media'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const missing = (e) => e && (e.code === 'PGRST202' || e.code === '42883' || e.status === 404 || /could not find the function|does not exist/i.test(e.message || ''))

// transient trouble (a sleeping server answering 502/503/504, a dropped connection) is worth retrying; a refusal is not
export const transient = (e) => !e || e.status === 0 || e.code === '40001' || [408, 425, 429, 500, 502, 503, 504].includes(e.status) || /network|fetch|timeout/i.test(e.message || '')

export async function withRetry(fn, { tries = 4, base = 1200, onRetry } = {}) {
  let last
  for (let i = 0; i < tries; i++) {
    try { return await fn() } catch (e) {
      last = e
      if (!transient(e) || i === tries - 1) break
      onRetry?.(i + 1)
      await sleep(base * 2 ** i)
    }
  }
  throw last
}

export const publicUrl = (path) => (supabase ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : `/media/${path}`)

async function viaServer(opt, onProgress) {
  const file = new File([opt.blob], `picture${opt.ext}`, { type: opt.mime })
  const r = await withRetry(() => uploadMedia({ file, onProgress }))
  return { path: r.path, url: r.url, assetId: '', reused: false, via: 'server' }
}

async function reserve(opt) {
  for (let wait = 0; wait < 12; wait++) {
    const { data, error } = await supabase.rpc('reserve_media_asset', { p_sha256: opt.sha256, p_mime: opt.mime, p_size: opt.size, p_width: opt.width, p_height: opt.height })
    if (error) throw error
    if (data.status === 'ready' || data.mustUpload) return data
    await sleep(1500) // another admin is uploading this very picture: wait for them instead of uploading it twice
  }
  throw Object.assign(new Error('busy'), { code: 'busy' })
}

// opt: the result of optimizeImage. Resolves { path, url, assetId, reused, via }.
export async function storeOptimized(opt, { onStage } = {}) {
  if (!supabase) return viaServer(opt, (p) => onStage?.('uploading', p))
  onStage?.('checking', 5)
  let res
  try { res = await withRetry(() => reserve(opt)) } catch (e) {
    if (missing(e)) return viaServer(opt, (p) => onStage?.('uploading', p))
    throw e
  }
  if (res.status === 'ready') { onStage?.('done', 100); return { path: res.path, url: publicUrl(res.path), assetId: res.assetId, reused: true, via: 'registry' } }
  onStage?.('uploading', 30)
  const up = await withRetry(() => supabase.storage.from(BUCKET).upload(res.path, opt.blob, { upsert: false, contentType: opt.mime, cacheControl: '31536000' }).then(({ error }) => {
    if (error && !/already exists|duplicate/i.test(error.message || '') && Number(error.statusCode) !== 409) throw Object.assign(new Error(error.message), { status: Number(error.statusCode) || 0, storage: true })
  }), { tries: 3 }).then(() => null, (e) => e)
  if (up) {
    await supabase.rpc('finish_media_asset', { p_asset: res.assetId, p_ok: false }).catch(() => {})
    if (up.storage && up.status >= 400 && up.status < 500) return viaServer(opt, (p) => onStage?.('uploading', p)) // the policy refused: let the server try
    throw up
  }
  onStage?.('saving', 85)
  const { data, error } = await supabase.rpc('finish_media_asset', { p_asset: res.assetId, p_ok: true })
  if (error) throw error
  if (data.status !== 'ready') throw Object.assign(new Error('not_ready'), { code: 'not_ready' })
  onStage?.('done', 100)
  return { path: res.path, url: publicUrl(res.path), assetId: res.assetId, reused: false, via: 'registry' }
}

// One call for the modules that pick a single file: optimize, then store.
export async function storeImageFile(file, profile = 'gallery', hooks) {
  const opt = await optimizeImage(file, profile)
  const r = await storeOptimized(opt, hooks)
  return { ...r, size: opt.size, originalSize: opt.originalSize, sha256: opt.sha256 }
}
