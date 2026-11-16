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
  await expect(header).toHaveClass(/is-clear/) // clear over the hero photograph
  const main = page.getByRole('navigation', { name: 'Main' })
  for (const label of ['Home', 'About', 'Students', 'Events', 'Alumni', 'Committee', 'Gallery', 'Contact']) await expect(main.getByRole('link', { name: label, exact: true })).toBeVisible()
  await expect(main.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Login', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Register', exact: true }).first()).toBeVisible()
  await page.mouse.wheel(0, 400)
  await expect(header).toHaveClass(/is-clear/) // still over the hero
  await page.mouse.wheel(0, 1200)
  await expect(header).toHaveClass(/is-scrolled/)
  await expect(header).not.toHaveClass(/is-clear/)
  await main.getByRole('link', { name: 'About', exact: true }).click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(main.getByRole('link', { name: 'About', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(header).not.toHaveClass(/on-hero/)
})

test('hero: the full name, two actions, three scenes; search opens a dialog from the header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /ব্রাহ্মণবাড়িয়া জেলা ছাত্রকল্যাণ পরিষদ, জগন্নাথ বিশ্ববিদ্যালয়/ })).toBeVisible()
  await expect(page.locator('.hs-fr.is-on img')).toBeVisible()
  await expect(page.locator('.hs-count')).toContainText('Boat race')
  await page.getByRole('link', { name: /Explore BSWA/ }).click()
  await expect(page).toHaveURL(/\/gallery$/)
  await page.goto('/')
  await page.getByRole('link', { name: 'Connect with students' }).click()
  await expect(page).toHaveURL(/\/students$/)
  await page.goto('/')
  // three scenes, chosen by thumbnail or by previous / next, and a pause button
  await expect(page.locator('.hs-tab')).toHaveCount(3)
  await page.locator('.hs-tab').nth(2).click()
  await expect(page.locator('.hs-tab').nth(2)).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('.hs-count')).toContainText('Islamic heritage')
  await page.getByRole('button', { name: 'Next scene' }).click()
  await expect(page.locator('.hs-tab').nth(0)).toHaveAttribute('aria-current', 'true')
  await page.getByRole('button', { name: 'Pause scenes' }).click()
  await expect(page.getByRole('button', { name: 'Play scenes' })).toHaveAttribute('aria-pressed', 'true')
  // search opens a dialog with suggestions; typing finds a student and Enter opens the profile
  await page.locator('.nav-tools').getByRole('button', { name: 'Search' }).click()
  const dialog = page.getByRole('dialog', { name: 'Search' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Go to')).toBeVisible()
  await dialog.getByRole('combobox').fill('Diba')
  await expect(dialog.getByRole('option').first()).toContainText('Diba')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/students\/s[0-9a-f]+$/)
  await expect(dialog).toBeHidden()
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeHidden()
  // on a phone the actions are full width and nothing scrolls sideways
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  await expect(page.locator('.hs-actions').getByRole('link', { name: /Explore BSWA/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('every link opens its page at the top, also a link to the page already open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/about')
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300)
  await page.locator('.site-footer').getByRole('link', { name: 'Events', exact: true }).click()
  await expect(page).toHaveURL(/\/events$/)
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Events', exact: true }).click()
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
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
  // the profile opens in a dialog over the list (the list stays behind it), not on a page of its own
  await cards.first().click()
  await expect(page).toHaveURL(/\/students\?.*profile=s[0-9a-f]+/)
  const dlg = page.getByRole('dialog', { name: 'Profile' })
  await expect(dlg).toBeVisible()
  await expect(dlg.getByRole('heading', { level: 1 })).toContainText('Diba')
  await expect(dlg.locator('.sp-facts')).not.toContainText('Phone')
  await expect(dlg.locator('.sp-cover')).toHaveCount(0) // no page furniture inside the dialog
  await expect(cards.first()).toBeAttached()
  // Escape, then Back, then the close button close it; a link opened directly is still a full page
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
  await expect(page).toHaveURL(/\/students\?q=Diba$/)
  await cards.first().click()
  await expect(dlg).toBeVisible()
  await page.goBack()
  await expect(dlg).toBeHidden()
  await cards.first().click()
  await dlg.getByRole('button', { name: 'Close' }).click()
  await expect(dlg).toBeHidden()
  const href = await cards.first().getAttribute('href')
  await page.goto(href)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Diba')
  await expect(page.getByRole('navigation', { name: 'Public profile' })).toBeVisible()
  await page.getByRole('link', { name: 'All students' }).click()
  await expect(page).toHaveURL(/\/students/)
})

test('alumni: a card opens the person in a dialog over the list', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/alumni')
  const cards = page.locator('.alumni-card')
  await expect(cards.first()).toBeVisible()
  const name = (await cards.first().locator('h3').innerText()).trim()
  await cards.first().locator('.al-open').click()
  await expect(page).toHaveURL(/\/alumni\?.*profile=/)
  const dlg = page.getByRole('dialog', { name })
  await expect(dlg).toBeVisible()
  await expect(dlg.getByRole('heading', { level: 1 })).toContainText(name)
  // a visitor who is not signed in sees who the person is, and is asked to sign in for the rest
  await expect(dlg.getByText(/visible to signed-in members only/)).toBeVisible()
  await expect(dlg.getByRole('link', { name: /Sign in/ })).toHaveAttribute('href', '/login')
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
  await expect(page).toHaveURL(/\/alumni$/)
  // the cards stay short: name, department, batch; no work, no contact
  await expect(page.locator('.alumni-card .al-work, .alumni-card .al-role, .alumni-card .al-contact, .alumni-card .al-locked')).toHaveCount(0)
  // and the public list does not even carry what people do or where
  const api = await (await page.request.get('/api/v1/alumni?limit=40')).json()
  expect(api.items.length).toBeGreaterThan(0)
  expect(api.items.every((x) => !x.occupation && !x.workplace && !x.designation && !x.contact)).toBe(true)
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

test('home: no "Together We Grow" line, slides last 6 seconds, the Facebook page is easy to find', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('.hs-actions')).toBeVisible()
  await expect(page.getByText(/Together We Grow/i)).toHaveCount(0)
  await expect(page.locator('.hs-tag')).toHaveCount(0)
  // the slide changes on its own about 6 seconds after it appears (it was 8): measured in the page
  const at = await page.evaluate(() => new Promise((res) => {
    const t0 = performance.now(); const first = document.querySelector('.hs-count')?.innerText
    const id = setInterval(() => { if (document.querySelector('.hs-count')?.innerText !== first) { clearInterval(id); res(performance.now() - t0) } }, 50)
    setTimeout(() => { clearInterval(id); res(-1) }, 9000)
  }))
  expect(at).toBeGreaterThan(5000)
  expect(at).toBeLessThan(7000)
  // the Facebook page: a clear button in the community band and a small link in the footer, both to the configured page, in the same tab
  for (const link of [page.locator('.cband .fb-btn'), page.locator('.site-footer .fb-foot')]) {
    await link.scrollIntoViewIfNeeded()
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', 'https://www.facebook.com/bswa.e2e.test')
    await expect(link).not.toHaveAttribute('target', '_blank') // every link opens in the same tab
    await expect(link).toHaveAttribute('rel', /noopener/)
  }
  // phone width: the button fits inside the screen once the section has faded in, and nothing scrolls sideways
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  const btn = page.locator('.cband .fb-btn')
  await btn.scrollIntoViewIfNeeded()
  await expect.poll(async () => { const r = await btn.boundingBox(); return r.x >= 0 && r.x + r.width <= 375 }).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('the website contact email is shown on the contact page and in the footer', async ({ page }) => {
  await page.goto('/help')
  const mail = 'brahmanbaria.jnu@gmail.com'
  await expect(page.locator('.contact-info a.ci-mail')).toHaveAttribute('href', `mailto:${mail}`)
  await expect(page.locator('.contact-info a.ci-mail')).toHaveText(mail)
  await expect(page.locator('.site-footer a.ft-mail')).toHaveAttribute('href', `mailto:${mail}`)
})

test('no link on the public site opens a new tab', async ({ page }) => {
  for (const url of ['/', '/help', '/gallery', '/heritage', '/events', '/directory']) {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    expect(await page.locator('a[target="_blank"]').count(), url).toBe(0)
  }
})

test('alumni: the photo in the profile dialog can be opened and zoomed, like on a student profile', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  // give the first alumnus a photo (any public picture will do)
  await page.route('**/api/v1/alumni?*', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    if (body.items?.[0]) body.items[0].photo = '/images/bswa/river.webp'
    await route.fulfill({ response: res, json: body })
  })
  await page.goto('/alumni')
  await page.locator('.alumni-card .al-open').first().click()
  const dlg = page.getByRole('dialog').first()
  await expect(dlg).toBeVisible()
  await dlg.locator('.sp-zoomable').click()
  const viewer = page.locator('.pv')
  await expect(viewer).toBeVisible()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.locator('.pv-pct')).not.toHaveText('100%')
  // Escape closes the viewer only; the profile stays until the next press
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  await expect(dlg).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
})
