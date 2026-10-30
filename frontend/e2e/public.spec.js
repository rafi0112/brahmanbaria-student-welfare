import { test, expect } from '@playwright/test'

// Public site: navigation, hero search, the mobile drawer and the account pages. English UI so labels are stable.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* ignore */ } })
})

test('desktop navigation: links, active state and the bar settling on scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const header = page.locator('header.site-header')
  await expect(header).toHaveClass(/on-hero/)
  await expect(header).not.toHaveClass(/is-scrolled/)
  const main = page.getByRole('navigation', { name: 'Main' })
  for (const label of ['Home', 'About', 'Students', 'Events', 'Alumni', 'Committee', 'Gallery', 'Help & Contact']) await expect(main.getByRole('link', { name: label, exact: true })).toBeVisible()
  await expect(main.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Login', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Register', exact: true }).first()).toBeVisible()
  await page.mouse.wheel(0, 600)
  await expect(header).toHaveClass(/is-scrolled/)
  await main.getByRole('link', { name: 'About', exact: true }).click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(main.getByRole('link', { name: 'About', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(header).not.toHaveClass(/on-hero/)
})

test('hero: the artwork with a real heading and working buttons; search lives in the header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /Our Heritage\. Our People\. Our Tomorrow\./ })).toBeAttached()
  await expect(page.locator('.hx-img')).toBeVisible()
  await page.getByRole('link', { name: 'Meet Our Students' }).first().click()
  await expect(page).toHaveURL(/\/students$/)
  await page.goto('/')
  await page.getByRole('link', { name: 'Explore Brahmanbaria' }).first().click()
  await expect(page).toHaveURL(/\/heritage$/)
  await page.locator('.nav-tools').getByRole('link', { name: 'Search' }).click()
  await expect(page).toHaveURL(/\/students$/)
  // on a phone the buttons sit under the picture, full size
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.hx-actions').getByRole('link', { name: 'Meet Our Students' })).toBeVisible()
})

test('mobile drawer opens, closes with Escape, and closes after navigating', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const menu = page.getByRole('button', { name: 'Menu' })
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
  await menu.click()
  const drawer = page.locator('#drawer')
  await expect(drawer).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await menu.click()
  await drawer.getByRole('link', { name: 'Gallery' }).click()
  await expect(page).toHaveURL(/\/gallery$/)
  await expect(drawer).toBeHidden()
})

test('login: labelled fields, password visibility toggle and the way to register', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1, name: 'Login' })).toBeVisible()
  const pw = page.getByLabel('Password', { exact: true })
  await pw.fill('secret-value')
  await expect(pw).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(pw).toHaveAttribute('type', 'text')
  await page.getByRole('main').getByRole('link', { name: 'Register' }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByLabel('Full name')).toBeVisible()
})

test('reduced motion: content is visible without waiting for animations', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.addInitScript(() => { localStorage.setItem('jk-lang', 'en') })
  await page.goto('/')
  const card = page.locator('[data-reveal]').first()
  await card.scrollIntoViewIfNeeded()
  await expect(card).toHaveCSS('opacity', '1')
  await ctx.close()
})

test('students: directory cards open the profile, filters narrow the list, and public viewers see four fields only', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/students')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('strength')
  await expect(page.getByRole('status').filter({ hasText: 'Public view' })).toBeVisible()
  const cards = page.locator('.student-card')
  await expect(cards.first()).toBeVisible()
  const total = await cards.count()
  await page.getByRole('searchbox').fill('Diba')
  await expect(page).toHaveURL(/q=Diba/)
  await expect(cards).toHaveCount(1)
  expect(total).toBeGreaterThan(1)
  await expect(cards.first()).not.toContainText('01') // no phone numbers in the public list
  await cards.first().click()
  await expect(page).toHaveURL(/\/students\/s[0-9a-f]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Diba')
  await expect(page.getByRole('navigation', { name: 'Public profile' })).toBeVisible()
  await expect(page.locator('.sp-facts')).not.toContainText('Phone')
  await page.getByRole('link', { name: 'All students' }).click()
  await expect(page).toHaveURL(/\/students/)
})

test('contact: the form validates on the server, then shows a clear success state', async ({ page }) => {
  // FAQ and Contact share one page; the old addresses land on their section
  await page.goto('/faq')
  await expect(page).toHaveURL(/\/help#faq$/)
  await page.goto('/contact')
  await expect(page).toHaveURL(/\/help#contact$/)
  await expect(page.getByRole('heading', { name: 'Frequently asked questions' })).toBeVisible()
  await expect(page.locator('.sketch-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Please correct the highlighted fields.')).toBeVisible()
  await page.getByLabel('Your name').fill('E2E Visitor')
  await page.getByLabel('Email').fill('visitor@example.test')
  await page.getByLabel('Subject').fill('Hello from the test')
  await page.getByLabel('Message').fill('This message checks the contact form end to end.')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('heading', { name: 'Message received' })).toBeVisible()
  await page.getByRole('button', { name: 'Send another message' }).click()
  await expect(page.getByLabel('Your name')).toHaveValue('')
})

test('responsive: no page scrolls sideways on a small phone, a tablet or a laptop', async ({ page }) => {
  test.setTimeout(180000)
  const pages = ['/', '/about', '/students', '/events', '/alumni', '/committee', '/gallery', '/help', '/heritage', '/directory', '/login', '/register', '/membership']
  for (const w of [320, 768, 1280]) {
    await page.setViewportSize({ width: w, height: 800 })
    for (const p of pages) {
      await page.goto(p)
      await page.waitForLoadState('networkidle')
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(over, `${p} at ${w}px`).toBe(0)
    }
  }
})
