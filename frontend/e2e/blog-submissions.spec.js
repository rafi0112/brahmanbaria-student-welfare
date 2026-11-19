import { test, expect } from '@playwright/test'
import { login } from './session.js'

// Members send writing and several pictures from the Blog page; admins read it in the panel and make a blog draft from
// it. Runs against the isolated in-memory API (see playwright.config.js), whose test account is an admin (any signed-in
// account may send).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* */ } })
})

const TITLE = 'E2E An afternoon by the Titas'

test('blog: a signed-out visitor is asked to sign in, and comes back to the form', async ({ page }) => {
  await page.goto('/blog')
  const box = page.locator('#write')
  await expect(box.getByRole('heading', { name: 'Sign in to send your writing' })).toBeVisible()
  await expect(box.getByRole('link', { name: 'Sign in', exact: true }).or(box.locator('a[href^="/login"]'))).toHaveAttribute('href', '/login?next=%2Fblog%23write')
})

test('blog: a member sends writing with several pictures; an admin reads it and makes a blog draft', async ({ page }) => {
  await login(page)
  await page.goto('/blog#write')
  const form = page.locator('#write form')
  await expect(form).toBeVisible()
  await form.getByRole('button', { name: /Send writing/ }).click()
  await expect(form.getByText('Give a title of at least 3 characters.')).toBeVisible()

  await form.getByLabel('Title').fill(TITLE)
  await form.getByLabel('Your writing').fill('We took a boat on the Titas with friends from the district.\n\nThe river was calm and the sky turned gold.')
  await page.evaluate(async () => {
    const dt = new DataTransfer()
    for (const seed of [1, 2, 3]) {
      const c = document.createElement('canvas'); c.width = 900; c.height = 600
      const x = c.getContext('2d'); x.fillStyle = `rgb(${seed * 70},110,140)`; x.fillRect(0, 0, 900, 600)
      dt.items.add(new File([await new Promise((r) => c.toBlob(r, 'image/png'))], `river-${seed}.png`, { type: 'image/png' }))
    }
    const input = document.querySelector('#write input[type=file]')
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const thumbs = form.locator('.bw-thumbs li')
  await expect(thumbs).toHaveCount(3)
  await expect(thumbs.first().getByText('Cover')).toBeVisible()
  await thumbs.nth(2).getByRole('button', { name: 'Remove picture 3' }).click()
  await expect(thumbs).toHaveCount(2)

  await form.getByRole('button', { name: /Send writing/ }).click()
  await expect(page.getByRole('heading', { name: 'Thank you! Your writing arrived' })).toBeVisible()
  const mine = page.locator('#bw-mine')
  await expect(mine.getByText(TITLE)).toBeVisible()
  await expect(mine.locator('li').filter({ hasText: TITLE }).getByText('Sent', { exact: true })).toBeVisible()

  // the admin side
  await page.goto('/admin/blog-submissions')
  await expect(page.getByRole('link', { name: 'Help for this page' })).toHaveAttribute('href', '/admin/manual#m-blog-submissions')
  await page.locator('.bs-views').getByRole('button', { name: /^New/ }).click()
  await expect(page).toHaveURL(/status=new/)
  const row = page.locator('.bs-row').filter({ hasText: TITLE })
  await expect(row).toContainText('2 pictures')
  await row.click()
  const drawer = page.getByRole('dialog', { name: 'Sent writing' })
  await expect(drawer.getByText('The river was calm')).toBeVisible()
  await expect(drawer.locator('.bs-photos img')).toHaveCount(2)
  expect(await drawer.locator('.bs-photos img').first().evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true)
  await drawer.getByRole('button', { name: 'Make a blog draft' }).click()
  await page.getByRole('dialog').filter({ hasText: 'A draft (unpublished) blog post' }).getByRole('button', { name: 'Make a blog draft' }).click()
  await expect(page).toHaveURL(/\/admin\/blog\?edit=/)

  // the member sees it was taken
  await page.goto('/blog#write')
  await expect(page.locator('#bw-mine li').filter({ hasText: TITLE }).getByText('Taken for publishing')).toBeVisible()
})
