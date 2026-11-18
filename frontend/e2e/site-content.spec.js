import { test, expect } from '@playwright/test'
import { E2E } from '../playwright.config.js'

// Home order, the hero line, About wording, plain sign-in pages, the Bangla font, and the admin tools for texts,
// gallery years and importing many records. Runs against the isolated in-memory API (see playwright.config.js).
const as = (lang) => async ({ page }) => {
  await page.addInitScript((l) => { try { localStorage.setItem('jk-lang', l); localStorage.setItem('jk-theme', 'light'); localStorage.removeItem('jk-texts') } catch { /* ignore */ } }, lang)
}

let session = null
async function login(page) {
  if (session) { await page.context().addCookies(session); return }
  await page.goto('/login')
  await page.locator('input[type=email]').fill(E2E.email)
  await page.locator('input[type=password]').fill(E2E.password)
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST'),
    page.locator('form button[type=submit]').click(),
  ])
  expect(res.status()).toBe(200)
  await page.waitForLoadState('networkidle')
  session = await page.context().cookies()
}

test.describe('in English', () => {
  test.beforeEach(as('en'))

  test('home: sections in the agreed order, the hero line on one line, no "Jagannath University · Dhaka"', async ({ page }) => {
    await page.goto('/')
    const heads = ['Discover the beauty of our land', 'Explore Brahmanbaria', 'Upcoming and recent events', 'Our district and community in numbers', 'The people shaping tomorrow']
    const tops = []
    for (const h of heads) {
      const el = page.getByRole('heading', { name: h })
      await expect(el).toBeVisible()
      tops.push(await el.evaluate((x) => x.getBoundingClientRect().top + scrollY))
    }
    expect([...tops].sort((a, b) => a - b), 'sections follow the agreed order').toEqual(tops)
    // the people section is the last one before the footer
    const after = await page.locator('section.cband').evaluate((x) => { let n = x.nextElementSibling; while (n && !n.offsetHeight) n = n.nextElementSibling; return n ? n.tagName : null })
    expect(after).toBeNull()
    await expect(page.getByText('Jagannath University · Dhaka')).toHaveCount(0)
    const org = page.locator('.hs-org')
    await expect(org).toHaveText('জেলা ছাত্রকল্যাণ পরিষদ, জগন্নাথ বিশ্ববিদ্যালয়')
    const lines = await org.evaluate((x) => Math.round(x.getBoundingClientRect().height / parseFloat(getComputedStyle(x).lineHeight)))
    expect(lines, 'one line').toBe(1)
  })

  test('Alumni and Events have their own modern page tops (not the Students one)', async ({ page }) => {
    for (const [path, variant] of [['/alumni', 'stack'], ['/events', 'glass']]) {
      await page.goto(path)
      await expect(page.locator(`.phero-wrap.phero-v-${variant}`)).toBeVisible()
      await expect(page.locator('.phero-v-bleed')).toHaveCount(0)
      await expect(page.locator('.phero-script')).toBeVisible()
    }
    await page.goto('/students')
    await expect(page.locator('.phero-v-bleed')).toBeVisible()
  })

  test('phones: buttons are not screen-wide and sit in the middle; alumni cards are the premium kind', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    for (const [path, sel] of [['/login', 'form button[type=submit]'], ['/students', '.sbar-go'], ['/', '.ex-all']]) {
      await page.goto(path)
      const b = page.locator(sel).first()
      await b.scrollIntoViewIfNeeded()
      const box = await b.boundingBox()
      expect(box.width, path + ' button width').toBeLessThanOrEqual(322)
      expect(box.height, path + ' button height').toBeLessThanOrEqual(46)
      expect(Math.abs(box.x + box.width / 2 - 375 / 2), path + ' centred').toBeLessThan(24)
    }
    await page.goto('/alumni')
    const card = page.locator('.alumni-card').first()
    await expect(card.locator('.al-badge')).toHaveCount(0) // no Alumni tag on the cards
    await expect(card).toHaveClass(/student-card/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })

  test('phones: the bar shows only the logo with BSWA and the menu; search, language and theme are inside the menu', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/about')
    const bar = page.locator('.nav-bar')
    await expect(bar.locator('.brand')).toBeVisible()
    await expect(bar.locator('.brand b')).toHaveText('BSWA')
    const visible = await bar.locator('button, a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0).map((e) => e.className))
    expect(visible.length, 'logo and menu button only').toBe(2)
    const menu = page.getByRole('button', { name: 'Menu' })
    const mb = await menu.boundingBox()
    expect(mb.x + mb.width).toBeGreaterThan(375 - 40) // on the right
    await menu.click()
    const drawer = page.locator('#drawer')
    await expect(drawer.locator('.dt-search')).toBeVisible()
    await drawer.getByRole('button', { name: /বাংলা|English/ }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'bn')
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.locator('.nav-tools').getByRole('button', { name: /খুঁজুন|Search/ })).toBeVisible()
  })

  test('English uses one font family everywhere', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const fams = await page.evaluate(() => [...document.querySelectorAll('body, h1, h2, h3, p, a, button, input, .phero-script, .cband-script, .eyebrow')]
      .filter((e) => e.offsetParent !== null && /[A-Za-z]/.test(e.textContent || e.placeholder || '')).map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, '').trim()))
    expect(new Set(fams)).toEqual(new Set(['Manrope Variable']))
    await page.goto('/login')
    expect((await page.locator('input[type=email]').evaluate((e) => getComputedStyle(e).fontFamily)).split(',')[0].replace(/"/g, '')).toBe('Manrope Variable')
  })

  test('admin: a picture chosen for upload can be previewed and cropped first; the edited copy replaces it', async ({ page }) => {
    await login(page)
    await page.goto('/admin/gallery')
    await page.getByRole('button', { name: /Upload/ }).first().click()
    // a real 300×200 picture made in the page
    const buf = Buffer.from(await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 300; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#3a7'; x.fillRect(0, 0, 300, 200); const b = await new Promise((r) => c.toBlob(r, 'image/png')); return [...new Uint8Array(await b.arrayBuffer())] }))
    await page.locator('.mu input[type=file]').setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: buf })
    await page.locator('.mu-item').getByRole('button', { name: 'Preview & adjust' }).click()
    const ed = page.getByRole('dialog', { name: 'Preview and adjust the picture' })
    await expect(ed.locator('.ie-img')).toBeVisible()
    await ed.getByRole('button', { name: 'Square 1:1' }).click()
    await ed.getByRole('button', { name: 'Use this picture' }).click()
    await expect(ed).toBeHidden()
    await expect(page.locator('.mu-item').getByRole('button', { name: 'Adjust again' })).toBeVisible()
    const dims = await page.locator('.mu-item img').first().evaluate((i) => new Promise((r) => { const im = new Image(); im.onload = () => r([im.naturalWidth, im.naturalHeight]); im.src = i.src }))
    expect(dims).toEqual([200, 200]) // the square cut from the middle of the 300×200 picture
  })

  test('desktop: student and alumni cards are a modest, equal size; Explore has one picture without a caption', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    for (const [path, sel] of [['/students', '.student-card'], ['/alumni', '.alumni-card']]) {
      await page.goto(path)
      await expect(page.locator(sel).first()).toBeVisible()
      const boxes = await page.locator(sel).evaluateAll((els) => els.slice(0, 24).map((e) => [e.offsetWidth, e.offsetHeight])) // layout size (an entrance animation may be scaling some)
      expect(new Set(boxes.map((b) => b[0])).size, path + ' one width').toBe(1)
      expect(new Set(boxes.map((b) => b[1])).size, path + ' one height').toBe(1)
      expect(boxes[0][0], path + ' not gigantic').toBeLessThanOrEqual(300)
      const pic = await page.locator(sel + ' .sc-mono').first().boundingBox()
      expect(pic.height).toBeLessThanOrEqual(180)
    }
    await page.goto('/')
    await page.locator('.ex-main').scrollIntoViewIfNeeded()
    await expect(page.locator('.ex-main figcaption')).toHaveCount(0)
    await expect(page.locator('.ex-inset')).toHaveCount(0)
  })

  test('sign-in and registration pages show the form only, no picture', async ({ page }) => {
    for (const path of ['/login', '/register']) {
      await page.goto(path)
      await expect(page.locator('form').first()).toBeVisible()
      await expect(page.locator('.auth img:not(.leafmark)'), 'only the small logo above the form').toHaveCount(0)
    }
  })

  test('admin: a text changed in "Website texts" shows on the site, and "Use the original" brings it back', async ({ page }) => {
    await login(page)
    await page.goto('/admin/site-texts')
    await page.getByPlaceholder('Search the texts (Bangla or English)…').fill('At a glance')
    const row = page.locator('.stx-row[data-text="home.atAGlance"]')
    // plain words, never code names: where the text appears and what it is
    await expect(row).toContainText('Home page')
    await expect(row).toContainText('Small line above the numbers heading')
    await expect(page.locator('.stx')).not.toContainText('home.atAGlance')
    await expect(row.locator('textarea[lang=en]'), 'the box holds the current wording').toHaveValue('At a glance')
    await row.locator('textarea[lang=en]').fill('In a few numbers')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved. The site shows the new wording now.')).toBeVisible()
    await page.goto('/')
    await expect(page.locator('.stat-head .eyebrow')).toHaveText('In a few numbers')
    await page.goto('/admin/site-texts')
    await page.getByPlaceholder('Search the texts (Bangla or English)…').fill('At a glance')
    await page.locator('.stx-row[data-text="home.atAGlance"]').getByRole('button', { name: 'Use the original' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved. The site shows the new wording now.')).toBeVisible()
    await page.goto('/')
    await expect(page.locator('.stat-head .eyebrow')).toHaveText('At a glance')
  })

  test('gallery: pictures are grouped by year, and admins can drag pictures into a new order', async ({ page }) => {
    await login(page)
    const mk = async (date, alt) => {
      const r = await page.request.post('/api/v1/admin/content/image', { data: { data: { image: 'titas-evening', alt, eventDate: date } } })
      expect(r.status()).toBe(201)
      const e = await r.json()
      expect((await page.request.post(`/api/v1/admin/content/image/${e.id}/publish`)).status()).toBe(200)
      return e.id
    }
    await mk('2023-04-01', 'E2E year picture 2023')
    await mk('2021-02-01', 'E2E year picture 2021')
    await page.goto('/gallery')
    const years = page.locator('.gal-years')
    await expect(years.getByRole('button', { name: '2023' })).toBeVisible()
    await expect(page.locator('.gal-year-h').filter({ hasText: '2023' })).toBeVisible()
    await years.getByRole('button', { name: '2021' }).click()
    await expect(page.getByRole('button', { name: 'E2E year picture 2021' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'E2E year picture 2023' })).toHaveCount(0)

    await page.goto('/admin/gallery')
    const cards = page.locator('.ad-grid-cards > li')
    await expect(cards.first()).toHaveAttribute('draggable', 'true')
    const before = await cards.locator('.ad-card-body strong').allTextContents()
    await cards.nth(0).dragTo(cards.nth(1))
    await expect(page.getByText(/order|ক্রম/i).first()).toBeVisible()
    await expect.poll(async () => (await cards.locator('.ad-card-body strong').allTextContents())[1]).toBe(before[0])
  })

  test('admin: many directory records from a CSV file, checked first, then added; the same file again adds nobody', async ({ page }) => {
    await login(page)
    const depts = (await (await page.request.get('/api/v1/departments')).json()).items
    const csv = `name,batch,department,phone\nCsv Import Person,15,${depts[0]},01799000111\nNo Dept,15,Nowhere,\n`
    const open = async () => {
      await page.goto('/admin/students?tab=imported')
      await page.getByRole('button', { name: 'Import from a file' }).click()
      await page.locator('.bi input[type=file]').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    }
    await open()
    await expect(page.locator('.bi-counts')).toContainText('1 ready to add')
    await expect(page.locator('.bi-table')).toContainText('No Dept')
    await page.getByRole('button', { name: 'Add 1' }).click()
    await expect(page.locator('.bi-counts')).toContainText('1 added')
    await page.locator('.bi').getByRole('button', { name: 'Close', exact: true }).click()
    await open()
    await expect(page.locator('.bi-counts')).toContainText('0 ready to add')
    await expect(page.locator('.bi-counts')).toContainText('1 already in the directory')
  })
})

test.describe('in Bangla', () => {
  test.beforeEach(as('bn'))

  test('About shows the association’s own wording', async ({ page }) => {
    await page.goto('/about')
    await expect(page.getByText('ব্রাহ্মণবাড়িয়া জেলা ছাত্রকল্যাণ পরিষদ, জগন্নাথ বিশ্ববিদ্যালয় ব্রাহ্মণবাড়িয়া থেকে আগত শিক্ষার্থীদের একটি ঐক্যবদ্ধ, অরাজনৈতিক ও কল্যাণমুখী সংগঠন।', { exact: false })).toBeVisible()
    await expect(page.getByText('একটি সুন্দর ও সুসংগঠিত শিক্ষার্থীসমাজ গড়ে তুলতে আমরা প্রতিশ্রুতিবদ্ধ।', { exact: false })).toBeVisible()
  })

  test('Bangla uses Tiro Bangla everywhere, and the font really loads', async ({ page }) => {
    const failed = []
    page.on('requestfailed', (r) => { if (/tiro/i.test(r.url())) failed.push(r.url()) })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.fonts.check('20px "Tiro Bangla"', 'বাংলা'))).toBe(true)
    for (const sel of ['body', 'h1', '.hs-org', '.eyebrow', 'a.btn, .hs-b2', 'footer']) {
      const fam = await page.locator(sel).first().evaluate((x) => getComputedStyle(x).fontFamily)
      expect(fam, sel).toMatch(/^"?Tiro Bangla"?/)
    }
    expect(failed).toEqual([])
    await page.goto('/login')
    expect(await page.locator('input[type=email]').evaluate((x) => getComputedStyle(x).fontFamily)).toMatch(/^"?Tiro Bangla"?/)
  })
})
