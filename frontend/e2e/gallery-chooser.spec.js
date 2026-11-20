import { test, expect } from '@playwright/test'
import { login } from './session.js'

// "Choose from the gallery" wherever a picture is picked: one picture (a blog cover), many at once (pictures inside a
// blog post, event photos, place photos, home slides). Runs against the isolated in-memory API (see playwright.config.js).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* */ } })
})

async function galleryPictures(page) {
  const made = []
  for (const [image, alt] of [['titas-evening', 'GC Titas evening'], ['akhaura-station', 'GC Akhaura station'], ['abi-river-park', 'GC River park']]) {
    const r = await page.request.post('/api/v1/admin/content/image', { data: { data: { image, alt, captionEn: alt } } })
    expect(r.status()).toBe(201)
    const e = await r.json()
    expect((await page.request.post(`/api/v1/admin/content/image/${e.id}/publish`)).status()).toBe(200)
    made.push(e.id)
  }
  return made
}

test('blog: the cover and pictures inside the text come from the gallery', async ({ page }) => {
  await login(page)
  await galleryPictures(page)
  await page.goto('/admin/blog?edit=new')
  const editor = page.getByRole('dialog').first()
  await editor.getByLabel('Title (English)').or(editor.getByLabel(/Title.*English/)).first().fill('GC gallery post')

  // the cover: one picture
  const cover = editor.locator('fieldset.ad-image').first()
  await cover.getByRole('button', { name: 'Choose from the gallery' }).click()
  const chooser = page.getByRole('dialog', { name: 'Choose a picture from the gallery' })
  await chooser.getByPlaceholder('Search pictures (caption or name)').fill('GC Titas')
  await chooser.getByRole('button', { name: /GC Titas evening/ }).click()
  await expect(chooser).toBeHidden()
  await expect(cover.locator('img.ad-thumb')).toHaveAttribute('src', /titas-evening-640\.webp/)

  // inside the text: several at once, in the order ticked
  await editor.getByRole('button', { name: 'Pictures from the gallery (several)' }).first().click()
  const many = page.getByRole('dialog', { name: /Choose pictures from the gallery/ })
  await many.getByRole('button', { name: /GC River park/ }).click()
  await many.getByRole('button', { name: /GC Akhaura station/ }).click()
  await expect(many.getByText('2 chosen')).toBeVisible()
  await many.getByRole('button', { name: 'Add 2 pictures' }).click()
  const body = editor.locator('textarea.wb-area').first()
  await expect(body).toHaveValue(/!\[GC River park\]\(\/images\/abi-river-park-1280\.webp\)\n\n!\[GC Akhaura station\]\(\/images\/akhaura-station-1280\.webp\)/)
  await editor.getByRole('tab', { name: 'Preview' }).first().click()
  await expect(editor.locator('.wb-preview figure img')).toHaveCount(2)
  await expect(editor.locator('.wb-preview figcaption').first()).toHaveText('GC River park')
})

test('events, places and home slides: many pictures from the gallery at once', async ({ page }) => {
  await login(page)
  await galleryPictures(page)

  await page.goto('/admin/events')
  await page.locator('.ad-head-action .btn-dark').first().click()
  await page.getByRole('button', { name: '+ Choose many from the gallery' }).click()
  let chooser = page.getByRole('dialog', { name: /Choose pictures from the gallery/ })
  await chooser.getByRole('button', { name: /GC Titas evening/ }).first().click()
  await chooser.getByRole('button', { name: /GC Akhaura station/ }).first().click()
  await chooser.getByRole('button', { name: 'Add 2 pictures' }).click()
  await expect(page.locator('.ad-gallery-grid fieldset')).toHaveCount(2)
  await expect(page.locator('.ad-gallery-grid img.ad-thumb').first()).toHaveAttribute('src', /titas-evening/)
  await page.keyboard.press('Escape')

  await page.goto('/admin/heritage?edit=new')
  await page.getByRole('button', { name: '+ Choose many from the gallery' }).click()
  chooser = page.getByRole('dialog', { name: /Choose pictures from the gallery/ })
  await chooser.getByRole('button', { name: /GC River park/ }).first().click()
  await chooser.getByRole('button', { name: 'Add 1 pictures' }).click()
  await expect(page.locator('.ad-image-slot img.ad-thumb').first()).toHaveAttribute('src', /abi-river-park/)

  await page.goto('/admin/site-images')
  await expect(page.locator('.si-slides li').first()).toBeVisible()
  const before = await page.locator('.si-slides li').count()
  await page.getByRole('button', { name: 'Choose one or more from the gallery' }).click()
  chooser = page.getByRole('dialog', { name: /Choose pictures from the gallery/ })
  await chooser.getByRole('button', { name: /GC River park/ }).first().click()
  await chooser.getByRole('button', { name: /GC Titas evening/ }).first().click()
  await chooser.getByRole('button', { name: 'Add 2 pictures' }).click()
  await expect(page.locator('.si-slides li')).toHaveCount(before + 2)
  // tidy up: the two new slides
  for (let k = 0; k < 2; k++) await page.locator('.si-slides li').last().getByRole('button', { name: 'Delete slide' }).click()
  await expect(page.locator('.si-slides li')).toHaveCount(before)
})
