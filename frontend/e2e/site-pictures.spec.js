import { test, expect } from '@playwright/test'
import { E2E } from '../playwright.config.js'
import { login } from './session.js'

// A picture chosen for one place on the site shows there and nowhere else. Uses pictures bundled with the site, so no
// upload is needed; the admin's own session saves them and visitors read them back.

test('each chosen picture appears in its own section only', async ({ page, browser }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* ignore */ } })
  await login(page)

  const save = (body) => page.request.put('/api/v1/admin/settings/site-images', { data: body })
  try {
    const r = await save({
      hero: [{ id: '', image: 'bariura-bridge', captionEn: 'Slide A', captionBn: '', published: true }, { id: '', image: 'titas-boat', captionEn: 'Slide B', captionBn: '', published: true }],
      pages: { students: 'kasba-sunset' }, galleryFeatured: 'meghna-bridge', explore: 'padma-beel',
    })
    expect(r.status()).toBe(200)

    // a visitor (no session) sees them
    const visitor = await (await browser.newContext()).newPage()
    await visitor.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en') } catch { /* ignore */ } })

    await visitor.goto('/students')
    await expect(visitor.locator('.phero-img')).toHaveAttribute('src', /kasba-sunset/)
    await visitor.goto('/alumni')
    await expect(visitor.locator('.phero-img')).not.toHaveAttribute('src', /kasba-sunset/)

    await visitor.goto('/gallery')
    await expect(visitor.locator('.gal-feature img')).toHaveAttribute('src', /meghna-bridge/)
    await visitor.goto('/students')
    await expect(visitor.locator('.gal-feature')).toHaveCount(0)

    await visitor.goto('/')
    await expect(visitor.locator('.hs-fr img').first()).toHaveAttribute('src', /bariura-bridge/)
    await expect(visitor.locator('.hs-tab')).toHaveCount(2)
    await expect(visitor.locator('.ex-main img')).toHaveAttribute('src', /padma-beel/)
    // the Explore picture is not the slide picture, and the slide pictures are not the page picture
    await expect(visitor.locator('.hs-fr img').first()).not.toHaveAttribute('src', /padma-beel|kasba-sunset/)

    // an unpublished slide never reaches visitors
    await save({ hero: [{ id: '', image: 'bariura-bridge', captionEn: '', captionBn: '', published: true }, { id: '', image: 'titas-boat', captionEn: '', captionBn: '', published: false }], pages: {}, galleryFeatured: '', explore: '' })
    await visitor.goto('/')
    await expect(visitor.locator('.hs-fr')).toHaveCount(1)
    await visitor.goto('/students')
    await expect(visitor.locator('.phero-img')).not.toHaveAttribute('src', /kasba-sunset/)
    await visitor.close()
  } finally {
    await save({ hero: [], pages: {}, galleryFeatured: '', explore: '' })
  }
})

// Choosing a picture in the admin (from the gallery) is saved at once: no extra Save press, and visitors see it.
test('choosing from the gallery in the admin goes live without pressing Save', async ({ page, browser }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* ignore */ } })
  await login(page)
  const clear = () => page.request.put('/api/v1/admin/settings/site-images', { data: { hero: [], pages: {}, galleryFeatured: '', explore: '' } })
  try {
    await page.goto('/admin/site-images')
    await page.waitForSelector('.si-card')
    // the three built-in slides are listed, ready to be edited like any other
    await expect(page.locator('.si-slides li')).toHaveCount(3)
    // the Gallery page's featured picture
    const featured = page.locator('.si-card').nth(1).locator('.si-slot').first()
    await featured.getByRole('button', { name: /Choose from the gallery/ }).click()
    await page.getByRole('dialog', { name: 'Choose a picture from the gallery' }).locator('.gc-item').first().click()
    await expect(page.locator('.notice.ok')).toContainText('Saved')
    // a slide, then its caption (saved when the field is left)
    await page.locator('.si-add .si-from').click()
    const many = page.getByRole('dialog', { name: /Choose pictures from the gallery/ })
    await many.locator('.gc-item').nth(1).click()
    await many.getByRole('button', { name: 'Add 1 pictures' }).click()
    await expect(page.locator('.si-slides li')).toHaveCount(4)
    await page.locator('.si-slides li').last().locator('input').nth(1).fill('Caption typed')
    await page.locator('.si-slides li').last().locator('input').nth(1).blur()
    await expect(page.locator('.notice.ok')).toContainText('Saved')

    const visitor = await (await browser.newContext()).newPage()
    await visitor.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en') } catch { /* ignore */ } })
    await visitor.goto('/gallery')
    await expect(visitor.locator('.gal-feature img')).toBeVisible()
    await visitor.goto('/')
    await expect(visitor.locator('.hs-fr')).toHaveCount(4)

    // a built-in slide can be deleted like any other, and it is saved at once
    await page.locator('.si-slides li').first().getByRole('button', { name: 'Delete slide' }).click()
    await expect(page.locator('.notice.ok')).toContainText('Saved')
    await expect(page.locator('.si-slides li')).toHaveCount(3)
    await visitor.goto('/')
    await expect(visitor.locator('.hs-fr')).toHaveCount(3)
    // unpublishing is saved at once too
    await page.locator('.si-slides li').first().getByRole('button', { name: 'Unpublish' }).click()
    await expect(page.locator('.notice.ok')).toContainText('Saved')
    await visitor.goto('/')
    await expect(visitor.locator('.hs-fr')).toHaveCount(2)
    // deleting every slide brings the three built-in pictures back
    for (let k = 0; k < 3; k++) await page.locator('.si-slides li').first().getByRole('button', { name: 'Delete slide' }).click()
    await expect(page.locator('.si-slides li')).toHaveCount(3)
    await visitor.goto('/')
    await expect(visitor.locator('.hs-fr')).toHaveCount(3)
    await expect(visitor.locator('.hs-count')).toContainText('Boat race')
    await visitor.close()
  } finally {
    await clear()
  }
})
