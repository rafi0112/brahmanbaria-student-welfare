// Decodes and re-encodes one picture away from the page's main thread, so a batch of large photos never freezes the screen.
import { MAX_SIDE, encodeBitmap } from './imageCore.js'

self.onmessage = async ({ data: { id, file, profile } }) => {
  try {
    let bitmap
    try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { throw Object.assign(new Error('corrupt'), { code: 'corrupt' }) }
    if (bitmap.width > MAX_SIDE || bitmap.height > MAX_SIDE) { bitmap.close(); throw Object.assign(new Error('dimensions'), { code: 'dimensions' }) }
    const out = await encodeBitmap(bitmap, profile)
    bitmap.close()
    self.postMessage({ id, ok: true, ...out })
  } catch (e) {
    self.postMessage({ id, ok: false, code: e.code || 'failed' })
  }
}
