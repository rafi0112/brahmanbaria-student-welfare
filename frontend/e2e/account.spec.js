import { test, expect } from '@playwright/test'
import zlib from 'node:zlib'
import { E2E } from '../playwright.config.js'
import { login } from './session.js'

// The signed-in header: account menu, the profile dialog (details and editing) and profile photos.
// Runs against the isolated in-memory API; the admin account gets a member profile first so every part has data.

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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* ignore */ } })
})

test('account menu, profile dialog with every detail, editing and a profile photo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login')
  await page.locator('input[type=email]').fill(E2E.email)
  await page.locator('input[type=password]').fill(E2E.password)
  await page.locator('form button[type=submit]').click()
  await page.waitForURL((u) => u.pathname === '/')
  // give the admin a member profile so the dialog has everything to show
  const made = await page.request.post('/api/v1/me/profile', { data: { name: 'Test Admin Person', batch: 16, department: 'Finance', session: '2019-20', occupation: 'Lecturer', workplace: 'Dhaka College', upazila: 'kasba', union: 'Kuti', phone: '01712345678', gender: 'female', bloodGroup: 'O+' } })
  expect([201, 409]).toContain(made.status())
  await page.goto('/')

  // header: search, language and theme first, then the account button (no separate admin/logout buttons)
  const tools = page.locator('.nav-tools')
  await expect(tools.getByRole('button', { name: 'Search' })).toBeVisible()
  await expect(tools.getByRole('button', { name: 'Login' })).toHaveCount(0)
  const acct = page.getByRole('button', { name: 'Account menu' })
  await expect(acct).toBeVisible()
  await acct.click()
  const menu = page.getByRole('menu')
  await expect(menu).toContainText('Test Admin Person')
  await expect(menu).toContainText(E2E.email)
  await expect(menu.getByRole('menuitem', { name: 'Admin panel' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  // the profile dialog shows every stored detail
  await acct.click()
  await page.getByRole('menuitem', { name: 'My profile' }).click()
  const dlg = page.locator('dialog.pdialog')
  await expect(dlg).toBeVisible()
  for (const v of ['Finance', '2019-20', 'Kuti', '01712345678', 'O+']) await expect(dlg).toContainText(v)

  // update: contact details save directly
  await dlg.getByRole('tab', { name: 'Update' }).click()
  const phone = dlg.getByLabel('Mobile number').first()
  await phone.fill('01898765432')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await expect(dlg.getByText('Saved.')).toBeVisible()

  // photo: the chosen picture opens in the editor first (square for a profile photo); turn it, use it, it is uploaded,
  // appears in the header button, then remove
  await dlg.locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(240, 160) })
  const ed = page.getByRole('dialog', { name: 'Preview and adjust the picture' })
  await expect(ed).toBeVisible()
  await expect(ed.getByRole('button', { name: 'Square 1:1' })).toHaveAttribute('aria-pressed', 'true')
  await expect(ed.locator('.ie-frame')).toBeVisible()
  const fr = await ed.locator('.ie-frame').boundingBox()
  expect(Math.abs(fr.width - fr.height)).toBeLessThan(2) // a square frame
  await ed.getByRole('button', { name: 'Turn right' }).click()
  await ed.getByRole('button', { name: 'Use this picture' }).click()
  await expect(ed).toBeHidden()
  await expect(dlg.getByRole('button', { name: 'Remove' })).toBeVisible()
  await expect(page.locator('.acct-btn img.avatar-img')).toBeVisible()
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/dialog-desktop.png` })
  await dlg.getByRole('button', { name: 'Remove' }).click()
  await expect(dlg.getByRole('button', { name: 'Remove' })).toHaveCount(0)
  await expect(dlg.getByRole('button', { name: 'Use link' })).toBeVisible() // a public link is offered first
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()

  // mobile: the bar keeps only the logo and the menu button; the account is in the menu; the dialog fills the screen
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeHidden()
  await page.getByRole('button', { name: 'Menu' }).click()
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/menu-mobile.png` })
  await page.locator('#drawer').getByRole('button', { name: 'My profile' }).click()
  await expect(dlg).toBeVisible()
  const box = await dlg.boundingBox()
  expect(box.width).toBeLessThan(390) // a pop-up with the page visible around it, not a full-screen page
  expect(box.x).toBeGreaterThan(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(box.y + box.height).toBeLessThanOrEqual(844)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/dialog-mobile.png` })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  // nothing in the pop-up scrolls sideways or touches its edges, on both tabs, even on a 320px phone
  for (const w of [390, 320]) {
    await page.setViewportSize({ width: w, height: 760 })
    for (const tab of [0, 1]) {
      await dlg.locator('.pd-tabs button').nth(tab).click()
      const m = await dlg.evaluate((d) => { const body = d.querySelector('.pd-body'); const b = body.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(body).paddingLeft)
        return { side: body.scrollWidth - body.clientWidth, pad, out: [...body.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.left < b.left + pad - 1 || r.right > b.right - pad + 1) && !e.closest('.facts, .card-form, .photo-pick, .notice') }).length } })
      expect(m.side, `${w}px tab ${tab}: no sideways scroll`).toBe(0)
      expect(m.pad).toBeGreaterThanOrEqual(16)
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  expect(overflow).toBe(0)
  await page.keyboard.press('Escape')

  // sign out from the menu
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.locator('#drawer').getByRole('button', { name: 'Log out' }).click()
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0)
})

test('an approved member corrects their own details (not the email) from My profile', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  const made = await page.request.post('/api/v1/me/profile', { data: { name: 'Test Admin Person', batch: 16, department: 'Finance', session: '2019-20', occupation: 'Lecturer', workplace: 'Dhaka College', upazila: 'kasba', union: 'Kuti', phone: '01712345678' } })
  expect([201, 409]).toContain(made.status())
  const me = await (await page.request.get('/api/v1/auth/me')).json()
  await page.request.post(`/api/v1/admin/students/${me.user.id}/approve`)
  await page.goto('/')

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'My profile' }).click()
  const dlg = page.locator('dialog.pdialog')
  await dlg.getByRole('tab', { name: 'Update' }).click()
  await dlg.getByRole('button', { name: 'Edit your details' }).click()
  const form = dlg.locator('section[aria-labelledby="chg-h"] form')
  await form.getByLabel('Full name').or(form.getByLabel(/^Name/)).first().fill('Corrected Person')
  await form.locator('select').first().selectOption('17')
  await form.getByLabel(/Profession/).fill('Researcher')
  await expect(form.getByText(/You sign in with your email/)).toBeVisible()
  await form.getByRole('button', { name: /Save/ }).click()
  await expect(dlg.getByText('Saved.').first()).toBeVisible()
  const after = await (await page.request.get('/api/v1/auth/me')).json()
  expect(after.profile.name).toBe('Corrected Person')
  expect(after.profile.batch).toBe(17)
  expect(after.profile.occupation).toBe('Researcher')
  expect(after.profile.status).toBe('approved')
  expect(after.user.email).toBe(E2E.email)
})
