import { test, expect } from '@playwright/test'
import { E2E } from '../playwright.config.js'
import { login } from './session.js'

// Videos on the home slides and in the gallery: a YouTube link or an uploaded file. Runs against the isolated in-memory
// API (see playwright.config.js), which has no file storage, so the one upload answer is stubbed in the browser.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* */ } })
})


const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(2000, 7)])

test('home slides: a YouTube video and an uploaded video fill the same frame as the pictures', async ({ page }) => {
  await login(page)
  // the in-memory API stores no files; the upload's answer is what the real server sends
  await page.route('**/api/v1/admin/video', (r) => r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ path: '0123abcd-0123-4567-89ab-0123456789ab.mp4', url: '/e2e-missing.mp4' }) }))
  await page.goto('/admin/site-images')
  const box = page.locator('.si-video')
  await box.getByLabel('YouTube video link').fill('https://youtu.be/dQw4w9WgXcQ?si=share')
  await expect(box.locator('.vp-ok img')).toHaveAttribute('src', /dQw4w9WgXcQ/)
  await box.getByRole('button', { name: 'Add the YouTube video' }).click()
  await expect(page.locator('.si-slides li').last().locator('.si-kind')).toHaveText('YouTube')
  await box.locator('input[type=file]').setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: MP4 })
  await expect(page.locator('.si-slides li').last().locator('.si-kind')).toHaveText('Video')
  await expect(page.getByText('Saved. The site shows it now.')).toBeVisible()

  // a .mov from an iPhone is refused with advice, before any upload
  await box.locator('input[type=file]').setInputFiles({ name: 'IMG_0001.MOV', mimeType: 'video/quicktime', buffer: MP4 })
  await expect(box.getByRole('alert')).toContainText('MP4')

  // both are saved (the test server has no file storage, so only the YouTube slide can be shown on the site here)
  const saved = await (await page.request.get('/api/v1/admin/settings/site-images')).json()
  const k = saved.hero.length
  expect(saved.hero[k - 2].youtube).toBe('dQw4w9WgXcQ')
  expect(saved.hero[k - 1].video).toBe('0123abcd-0123-4567-89ab-0123456789ab.mp4')
  // on the home page the YouTube slide takes the frame of a picture
  const api = await (await page.request.get('/api/v1/site-images')).json()
  const n = api.hero.length
  expect(api.hero[n - 1].youtube).toBe('dQw4w9WgXcQ')
  await page.goto('/')
  const tabs = page.locator('.hs-tab')
  await expect(tabs).toHaveCount(n)
  await tabs.nth(n - 1).click()
  const yt = page.locator('.hs-fr.is-on .hs-yt iframe')
  await expect(yt).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*mute=1/)
  const frame = await page.locator('.hs-fr.is-on').boundingBox()
  const wrap = await page.locator('.hs-fr.is-on .hs-yt').boundingBox()
  expect(Math.round(wrap.width)).toBe(Math.round(frame.width)) // the same frame as a picture
  expect(Math.round(wrap.height)).toBe(Math.round(frame.height))

  // tidy up: remove the two video slides again
  await page.goto('/admin/site-images')
  for (let k = 0; k < 2; k++) await page.locator('.si-slides li').last().getByRole('button', { name: 'Delete slide' }).click()
  await expect(page.locator('.si-slides li .si-kind')).toHaveCount(0)
})

test('gallery: a YouTube video is added, shown with a play mark, and plays in the viewer', async ({ page }) => {
  await login(page)
  await page.goto('/admin/gallery')
  await page.getByRole('button', { name: '+ Add a video' }).click()
  const dlg = page.getByRole('dialog', { name: 'Add a video to the gallery' })
  await dlg.getByLabel('YouTube video link').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')
  await dlg.getByRole('button', { name: 'Add the YouTube video' }).click()
  await dlg.getByLabel('Caption (English)').fill('E2E festival film')
  await dlg.getByLabel('Date (optional)').fill('2024-02-21')
  await dlg.getByRole('button', { name: 'Add to the gallery' }).click()
  await expect(dlg).toBeHidden()
  await page.goto('/admin/gallery?q=' + encodeURIComponent('E2E festival film')) // the list may run to more pages
  const card = page.locator('.ad-grid-cards > li').filter({ hasText: 'E2E festival film' })
  await expect(card.locator('.si-kind')).toHaveText('YouTube')
  await card.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Show on site', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Show on site', exact: true }).click()

  await page.goto('/gallery')
  const item = page.getByRole('button', { name: 'E2E festival film' })
  await expect(item.locator('.gal-play')).toBeVisible()
  await expect(item.locator('img')).toHaveAttribute('src', /i\.ytimg\.com\/vi\/dQw4w9WgXcQ/)
  await expect(page.locator('.gal-years').getByRole('button', { name: '2024' })).toBeVisible()
  await item.click()
  await expect(page.locator('.lightbox .lb-video iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*autoplay=1/)
  await page.keyboard.press('Escape')
  await expect(page.locator('.lightbox')).toHaveCount(0)
})
