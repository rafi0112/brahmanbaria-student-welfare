import { test, expect } from '@playwright/test'
import { E2E } from '../playwright.config.js'

// Several pictures at once in the Gallery admin: chosen together, previews, extra picks keep the earlier ones, single
// removal, original and optimized sizes, a batch total, and one stored file per distinct picture. Storage is off in the
// in-memory test server, so the upload endpoint is answered by the test; everything before it (reading, shrinking, hashing)
// runs for real in the browser.

// pictures made in the page: noisy so that they are big, and each seed gives a different picture
const makePictures = (seeds, side = 1800) => `(async () => {
  const out = []
  for (const seed of ${JSON.stringify(seeds)}) {
    const c = document.createElement('canvas'); c.width = ${side}; c.height = Math.round(${side} * 2 / 3)
    const x = c.getContext('2d'); const img = x.createImageData(c.width, c.height); let s = seed * 9301 + 49297
    for (let i = 0; i < img.data.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; img.data[i] = (s >> 8) & 255; img.data[i + 1] = (s >> 16) & 255; img.data[i + 2] = (seed * 40) & 255; img.data[i + 3] = 255 }
    x.putImageData(img, 0, 0)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    out.push(new File([blob], 'photo-' + seed + '.png', { type: 'image/png', lastModified: 1000 + seed }))
  }
  return out
})()`

async function choose(page, js) {
  await page.evaluate(async (code) => {
    const files = await eval(code)
    const input = document.querySelector('.mu input[type=file]')
    const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f))
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, js)
}

test('gallery: several pictures chosen together are optimized and stored once each', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* ignore */ } })
  await page.goto('/login')
  await page.locator('input[type=email]').fill(E2E.email)
  await page.locator('input[type=password]').fill(E2E.password)
  await page.locator('form button[type=submit]').click()
  await page.waitForURL((u) => u.pathname === '/')

  const uploads = []
  let seq = 0
  await page.route('**/api/v1/admin/media', async (route) => {
    const body = route.request().postDataBuffer()
    uploads.push(body ? body.length : 0)
    seq++
    const name = `${String(seq).padStart(8, '0')}-aaaa-4aaa-8aaa-${String(seq).padStart(12, '0')}.jpg`
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ path: name, url: `/media/${name}` }) })
  })
  const created = []
  page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/v1\/admin\/content\/image$/.test(r.url())) created.push(r.postData()) })

  await page.goto('/admin/gallery')
  await page.getByRole('button', { name: /Upload pictures|Upload/ }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // five different pictures, then one more picked later: the first five stay
  await choose(page, makePictures([1, 2, 3, 4, 5]))
  await expect(dialog.locator('.mu-item')).toHaveCount(5)
  await choose(page, makePictures([6]))
  await expect(dialog.locator('.mu-item')).toHaveCount(6)
  // the same file picked again is not added twice
  await choose(page, makePictures([6]))
  await expect(dialog.locator('.mu-item')).toHaveCount(6)
  // a file that is not accepted is listed as skipped, with the reason, and never uploaded
  await page.evaluate(() => {
    const input = document.querySelector('.mu input[type=file]')
    const dt = new DataTransfer()
    dt.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', { type: 'image/svg+xml' }))
    dt.items.add(new File([new Uint8Array(16 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' }))
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(dialog.locator('.mu-item.is-rejected')).toHaveCount(2)
  await expect(dialog.locator('.mu-item.is-rejected').first()).toContainText(/SVG/)
  await expect(dialog.locator('.mu-item.is-rejected').nth(1)).toContainText(/15 MB/)
  // one chosen picture is taken out again
  await dialog.locator('.mu-item').nth(5).getByRole('button', { name: 'Remove' }).click()
  await expect(dialog.locator('.mu-item:not(.is-rejected)')).toHaveCount(5)
  // and the same picture under another name is spotted after optimizing (same bytes)
  await choose(page, makePictures([1]).replace("'photo-' + seed", "'copy-of-' + seed").replace('1000 + seed', '5000 + seed'))
  await expect(dialog.locator('.mu-item:not(.is-rejected)')).toHaveCount(6)

  await dialog.getByRole('button', { name: /Upload 6 pictures/ }).click()
  await expect(dialog.getByText(/5 of 6 done/)).toBeVisible({ timeout: 60000 })
  await expect(dialog.locator('.mu-item.is-skipped')).toHaveCount(1)
  await expect(dialog.locator('.mu-item.is-done')).toHaveCount(5)
  // sizes: each shows original → optimized, and the batch shows the saving
  await expect(dialog.locator('.mu-item.is-done').first()).toContainText(/MB → \d+ KB|KB → \d+ KB|MB → \d+(\.\d)? MB/)
  await expect(dialog.getByText(/Originals .* → stored/)).toBeVisible()

  // exactly one upload and one new entry per distinct picture, and only the optimized bytes were sent
  console.log('UPLOAD_BYTES', JSON.stringify(uploads), await dialog.locator('.mu-item.is-done small.muted').first().innerText())
  expect(uploads).toHaveLength(5)
  expect(created).toHaveLength(5)
  expect(Math.max(...uploads)).toBeLessThan(2 * 1024 * 1024)

  await dialog.getByRole('button', { name: 'Finish' }).click()
  await expect(dialog).toBeHidden()
})
