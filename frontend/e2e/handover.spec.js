import { test, expect } from '@playwright/test'
import { E2E } from '../playwright.config.js'
import { login } from './session.js'

// What makes the site easy to run and to use: the manual last in the admin menu and a help link on each page, several
// event photos at once, the server-waking notice, back to top, sharing an event and adding it to a calendar, and the
// install-as-app manifest. Runs against the isolated in-memory API (see playwright.config.js).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* */ } })
})


test('admin: the manual is the last item of the menu, and each page links to its part of it', async ({ page }) => {
  await login(page)
  await page.goto('/admin/gallery')
  const links = page.locator('.adm-nav a')
  await expect(links.last()).toHaveText(/User manual/)
  await page.getByRole('link', { name: 'Help for this page' }).click()
  await expect(page).toHaveURL(/\/admin\/manual#m-gallery$/)
  await expect(page.locator('#m-gallery')).toBeInViewport()
  for (const [path, part] of [['/admin/site-texts', 'site-texts'], ['/admin/events', 'events'], ['/admin/students?tab=imported', 'directory'], ['/admin/contact', 'contact']]) {
    await page.goto(path)
    await expect(page.getByRole('link', { name: 'Help for this page' })).toHaveAttribute('href', `/admin/manual#m-${part}`)
    await expect(page.locator(`#m-${part}`)).toHaveCount(0) // (the part lives on the manual page)
  }
})

test('admin: several event photos are added at once', async ({ page }) => {
  await login(page)
  let n = 0
  await page.route('**/api/v1/admin/media', (r) => { n++; const name = `0000000${n}-0000-4000-8000-000000000000.jpg`.slice(-40); return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ path: `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000.jpg`, url: '/images/titas-evening-640.webp', name }) }) })
  await page.goto('/admin/events')
  await page.locator('.ad-head-action .btn-dark').first().click()
  await page.getByRole('button', { name: '+ Add many photos at once' }).click()
  await page.evaluate(async () => {
    const files = []
    for (const seed of [1, 2, 3]) {
      const c = document.createElement('canvas'); c.width = 400; c.height = 300
      const x = c.getContext('2d'); x.fillStyle = `rgb(${seed * 60},90,120)`; x.fillRect(0, 0, 400, 300)
      files.push(new File([await new Promise((r) => c.toBlob(r, 'image/png'))], `p${seed}.png`, { type: 'image/png', lastModified: seed }))
    }
    const input = document.querySelector('.mu input[type=file]')
    const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.getByRole('button', { name: /Upload 3 pictures/ }).click()
  await expect(page.locator('.mu-item.is-done')).toHaveCount(3)
  await page.getByRole('dialog').filter({ has: page.locator('.mu') }).getByRole('button', { name: 'Close' }).first().click()
  await expect(page.locator('.ad-gallery-grid fieldset, .ad-gallery-grid .photo-picker')).toHaveCount(3)
})

test('visitors: the server-waking notice, back to top, sharing and calendar on an event, the app manifest', async ({ page }) => {
  // a slow answer shows the notice, and it goes once the answer arrives
  await page.route('**/api/v1/events', async (r) => { await new Promise((ok) => setTimeout(ok, 6500)); await r.continue() })
  await page.goto('/events')
  await expect(page.getByRole('status').filter({ hasText: 'The server is waking up' })).toBeVisible({ timeout: 9000 })
  await expect(page.getByText('The server is waking up')).toHaveCount(0, { timeout: 10000 })
  await page.unroute('**/api/v1/events')

  // back to top on a long page
  await page.goto('/')
  const top = page.locator('button.to-top')
  await expect(top).not.toHaveClass(/is-on/)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect(top).toHaveClass(/is-on/)
  await top.click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50)

  // an event: copy its link (no share sheet in the test browser) and download a calendar file
  await login(page)
  const made = await page.request.post('/api/v1/admin/content/event', { data: { slug: 'e2e-iftar-mahfil', data: { titleEn: 'E2E Iftar mahfil', titleBn: 'ইফতার মাহফিল', date: '2026-03-10', time: '17:30', venue: 'TSC, Dhaka' } } })
  const ev = await made.json()
  expect([200, 201]).toContain(made.status())
  expect((await page.request.post(`/api/v1/admin/content/event/${ev.id}/publish`)).status()).toBe(200)
  ev.date = '2026-03-10'
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true }) })
  await page.goto(`/events/${ev.slug}`)
  await page.getByRole('button', { name: 'Share' }).click()
  await expect(page.getByText('Link copied.')).toBeVisible()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Add to calendar' }).click()])
  expect(dl.suggestedFilename()).toBe(`${ev.slug}.ics`)
  const body = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString())
  expect(body).toContain('BEGIN:VEVENT')
  expect(body).toContain(ev.date.replace(/-/g, ''))

  // installable: a manifest with the name and icons
  const man = await (await page.request.get('/site.webmanifest')).json()
  expect(man.short_name).toBe('BSWA')
  expect(man.icons.some((i) => i.sizes === '512x512')).toBe(true)
  await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/site.webmanifest')
})
