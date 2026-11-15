import { test, expect } from '@playwright/test'
import zlib from 'node:zlib'
import { E2E } from '../playwright.config.js'

// The profile picture on a student's page opens in a viewer that zooms (buttons, keyboard, wheel, double-click) and closes.

function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const rows = []
  for (let y = 0; y < h; y++) { const r = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { r[1 + x * 3] = 233; r[2 + x * 3] = 79 + (y % 60); r[3 + x * 3] = 32 } rows.push(r) }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

test('a click on the profile picture opens a viewer that zooms in and out', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* ignore */ } })
  await page.goto('/login')
  await page.locator('input[type=email]').fill(E2E.email)
  await page.locator('input[type=password]').fill(E2E.password)
  await page.locator('form button[type=submit]').click()
  await page.waitForURL((u) => u.pathname === '/')
  const made = await page.request.post('/api/v1/me/profile', { data: { name: 'Viewer Person', batch: 16, department: 'Finance', occupation: 'Lecturer', workplace: 'Dhaka College', upazila: 'kasba' } })
  expect([201, 409]).toContain(made.status())
  const up = await page.request.post('/api/v1/me/photo', { multipart: { file: { name: 'me.png', mimeType: 'image/png', buffer: png(400, 400) } } })
  expect(up.ok()).toBeTruthy()
  const me = await (await page.request.get('/api/v1/auth/me')).json()
  const ok = await page.request.post('/api/v1/admin/members/' + me.profile.userId + '/approve')
  expect(ok.ok()).toBeTruthy()
  await page.goto('/students/m-' + me.profile.userId)
  const open = page.getByRole('button', { name: /View the photo larger/ })
  await expect(open).toBeVisible()
  await open.click()
  const viewer = page.getByRole('dialog')
  await expect(viewer).toBeVisible()
  const pct = viewer.locator('.pv-pct')
  await expect(pct).toHaveText('100%')
  await viewer.getByRole('button', { name: 'Zoom in' }).click()
  await expect(pct).toHaveText('140%')
  await page.keyboard.press('+')
  await expect(pct).toHaveText('196%')
  await page.locator('.pv-stage').dblclick()
  await expect(pct).toHaveText('100%')
  await page.locator('.pv-stage').dblclick()
  await expect(pct).toHaveText('250%')
  await page.screenshot({ path: process.env.PV_SHOT || 'test-results/pv.png' })
  await viewer.getByRole('button', { name: 'Reset' }).click()
  await expect(pct).toHaveText('100%')
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
})
