import { test, expect } from '@playwright/test'
import { login } from './session.js'

// On a student's details page an admin changes every picture right there: the cover at the top, the picture beside the
// details (both the same on every profile page) and the person's own photo. Visitors never see these buttons.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* */ } })
})

test('admin: the cover, the side picture and the photo of a profile page are changed from the page', async ({ page, browser }) => {
  await login(page)
  const r = await page.request.post('/api/v1/admin/content/image', { data: { data: { image: 'titas-evening', alt: 'PP Titas evening', captionEn: 'PP Titas evening' } } })
  expect(r.status()).toBe(201)
  expect((await page.request.post(`/api/v1/admin/content/image/${(await r.json()).id}/publish`)).status()).toBe(200)
  const list = await (await page.request.get('/api/v1/students?limit=1')).json()
  const id = list.items[0].id

  try {
    await page.goto(`/students/${id}`)
    const cover = page.locator('.sp-cover')
    await expect(cover.locator('img')).toHaveAttribute('src', /hero-1672/)

    // the cover: from the gallery; it shows at once
    await cover.getByRole('button', { name: 'Change picture' }).click()
    let dlg = page.getByRole('dialog', { name: /top of profile pages/ })
    await dlg.getByRole('button', { name: 'Choose from the gallery' }).click()
    const chooser = page.getByRole('dialog', { name: 'Choose a picture from the gallery' })
    await chooser.getByPlaceholder('Search pictures (caption or name)').fill('PP Titas')
    await chooser.getByRole('button', { name: /PP Titas evening/ }).click()
    await expect(dlg.getByText('Saved. Every profile page shows it now.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(cover.locator('img')).toHaveAttribute('src', /titas-evening/)

    // the picture beside the details
    const side = page.locator('.sp-place-img')
    await side.getByRole('button', { name: 'Change picture' }).click()
    dlg = page.getByRole('dialog', { name: /beside the details/ })
    await dlg.getByRole('button', { name: 'Choose from the gallery' }).click()
    await chooser.getByPlaceholder('Search pictures (caption or name)').fill('PP Titas')
    await chooser.getByRole('button', { name: /PP Titas evening/ }).click()
    await expect(dlg.getByText('Saved. Every profile page shows it now.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(side.locator('img')).toHaveAttribute('src', /titas-evening/)

    // a visitor sees the new pictures, and no buttons
    const visitor = await (await browser.newContext()).newPage()
    await visitor.goto(`/students/${id}`)
    await expect(visitor.locator('.sp-cover img')).toHaveAttribute('src', /titas-evening/)
    await expect(visitor.locator('.sp-place-img img')).toHaveAttribute('src', /titas-evening/)
    await expect(visitor.locator('.pic-edit')).toHaveCount(0)
    await visitor.context().close()

    // the person's own photo: for a directory record, its photo link (upload, link or gallery)
    await page.locator('.sp-avatar-wrap').getByRole('button', { name: 'Change photo' }).click()
    dlg = page.getByRole('dialog', { name: /Change photo/ })
    await expect(dlg.getByPlaceholder('https://drive.google.com/…').first()).toBeVisible()
    await page.keyboard.press('Escape')

    // "Remove" brings back the built-in cover
    await cover.getByRole('button', { name: 'Change picture' }).click()
    dlg = page.getByRole('dialog', { name: /top of profile pages/ })
    await dlg.getByRole('button', { name: 'Remove' }).click()
    await expect(dlg.getByText('Saved. Every profile page shows it now.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(cover.locator('img')).toHaveAttribute('src', /hero-1672/)
  } finally {
    for (const k of ['profile-cover', 'profile-side']) await page.request.put(`/api/v1/admin/settings/site-images/page/${k}`, { data: { image: '' } })
  }
})
