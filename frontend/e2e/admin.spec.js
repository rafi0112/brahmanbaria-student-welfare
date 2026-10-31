import { test, expect } from '@playwright/test'
import { E2E } from '../playwright.config.js'

// Runs against the isolated in-memory API (see playwright.config.js). English UI so labels are stable.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* ignore */ } })
})

// Signing in goes through the real form once; later tests reuse that session cookie (the API rate-limits sign-ins per address).
let session = null
async function login(page) {
  if (session) {
    await page.context().addCookies(session)
    await page.goto('/admin')
    await expect(page.locator('#adm-main')).toBeVisible()
    return
  }
  await page.goto('/login')
  await page.locator('input[type=email]').fill(E2E.email)
  await page.locator('input[type=password]').fill(E2E.password)
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST'),
    page.locator('form button[type=submit]').click(),
  ])
  expect(res.status(), 'sign-in against the isolated API').toBe(200)
  await page.waitForLoadState('networkidle')
  session = await page.context().cookies()
  await page.goto('/admin')
  await expect(page.locator('#adm-main')).toBeVisible()
}

const side = (page) => page.locator('.adm-side')
// a child link inside one section ("Published" exists under both Blog and Gallery)
const kid = (page, parent, name) => side(page).locator('.adm-parent').filter({ has: page.getByRole('button', { name: parent, exact: true }) }).getByRole('link', { name, exact: true })

test('admin shell: one sidebar, no public navigation', async ({ page }) => {
  await login(page)
  await expect(page.locator('header.site-header, .site-header')).toHaveCount(0)
  await side(page).getByRole('button', { name: 'Students', exact: true }).click() // opens like Messages
  for (const label of ['Dashboard', 'Activity', 'Membership Requests', 'Membership Directory', 'Admin management', 'Executive Committee']) {
    await expect(side(page).getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  for (const label of ['Blog', 'Heritage places', 'Gallery']) {
    await expect(side(page).getByRole('button', { name: label, exact: true })).toBeVisible() // sections with filtered views
  }
})

test('sidebar groups collapse with animation and keep the current page highlighted', async ({ page }) => {
  await login(page)
  await page.goto('/admin/blog')
  const content = side(page).getByRole('button', { name: 'Content' })
  await expect(content).toHaveAttribute('aria-expanded', 'true')
  await content.click()
  await expect(content).toHaveAttribute('aria-expanded', 'false')
  await expect(side(page).getByRole('link', { name: 'Executive Committee' })).toBeVisible()
  await expect(side(page).getByRole('button', { name: 'Blog', exact: true })).toBeHidden()
  await page.goto('/admin/blog?status=draft') // the group holding the current page opens itself
  await expect(content).toHaveAttribute('aria-expanded', 'true')
  await expect(kid(page, 'Blog', 'Draft')).toHaveAttribute('aria-current', 'page')
})

test('favorites: star a page, make a folder, move it in, and everything survives a reload', async ({ page }) => {
  await login(page)
  await page.goto('/admin/students')
  await page.getByRole('button', { name: 'Add to favorites' }).click()
  await page.getByRole('dialog', { name: 'Add to favorites' }).getByRole('button', { name: 'Add', exact: true }).click()
  await expect(side(page).locator('.fav-link', { hasText: 'Membership Requests' })).toBeVisible()

  await side(page).getByRole('button', { name: 'New folder' }).click()
  await page.keyboard.type('Weekly review')
  await page.keyboard.press('Enter')
  const folder = side(page).locator('.fav-folder', { hasText: 'Weekly review' })
  await expect(folder).toBeVisible()
  await expect(folder.getByText('Empty folder')).toBeVisible()

  const favRow = side(page).locator('.fav-row', { hasText: 'Membership Requests' }).last()
  await favRow.hover()
  await favRow.getByRole('button', { name: /Actions/ }).click()
  await page.getByRole('menuitem', { name: 'Move to Weekly review' }).click()
  await expect(folder.locator('.fav-link', { hasText: 'Membership Requests' })).toBeVisible()

  await page.reload()
  await expect(side(page).locator('.fav-folder', { hasText: 'Weekly review' }).locator('.fav-link', { hasText: 'Membership Requests' })).toBeVisible()

  // removing the shortcut does not touch any data
  const favRow2 = side(page).locator('.fav-row', { hasText: 'Membership Requests' }).last()
  await favRow2.hover()
  await favRow2.getByRole('button', { name: /Actions/ }).click()
  await page.getByRole('menuitem', { name: 'Remove from favorites' }).click()
  await expect(side(page).locator('.fav-link', { hasText: 'Membership Requests' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Membership Requests' })).toBeVisible()
})

test('a bad stored favorite is ignored instead of breaking the sidebar', async ({ page }) => {
  await login(page)
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jk-fav:'))
    const bad = { v: 1, items: [{ type: 'link', id: 'x', label: 'Evil', to: 'javascript:alert(1)' }, { type: 'link', id: 'y', label: 'Gone', to: '/admin/removed' }, { type: 'link', id: 'z', label: 'Fine', to: '/admin/gallery' }], groups: {} }
    localStorage.setItem(k || 'jk-fav:probe', JSON.stringify(bad))
  })
  await page.reload()
  await expect(side(page).locator('.fav-link', { hasText: 'Fine' })).toBeVisible()
  await expect(side(page).locator('.fav-link', { hasText: 'Evil' })).toHaveCount(0)
  await expect(side(page).locator('.fav-link', { hasText: 'Gone' })).toHaveCount(0)
})

test('icon rail remembers its state and Ctrl+K opens quick search', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect(page.locator('.adm')).toHaveAttribute('data-collapsed', 'true')
  await page.reload()
  await expect(page.locator('.adm')).toHaveAttribute('data-collapsed', 'true')
  await page.keyboard.press('Control+b')
  await expect(page.locator('.adm')).toHaveAttribute('data-collapsed', 'false')
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('mobile: the sidebar is a drawer that closes after navigating', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await login(page)
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.locator('.adm')).toHaveAttribute('data-open', 'true')
  await side(page).getByRole('link', { name: 'Activity' }).click()
  await expect(page).toHaveURL(/\/admin\/activity/)
  await expect(page.locator('.adm')).toHaveAttribute('data-open', 'false')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('blog: a new draft is saved and listed', async ({ page }) => {
  await login(page)
  // the editor opens as a modal over the list (the old /new address leads there too)
  await page.goto('/admin/blog/new')
  await expect(page).toHaveURL(/\/admin\/blog\?edit=new$/)
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Title', { exact: false }).first().fill('E2E smoke post')
  await dlg.getByRole('button', { name: /save draft|save/i }).first().click()
  // after the first save the modal holds the saved post, so saving again updates it instead of creating a copy
  await expect(page).toHaveURL(/edit=(?!new)[^&]+$/)
  await dlg.getByLabel('Title', { exact: false }).first().fill('E2E smoke post edited')
  await dlg.getByRole('button', { name: 'Save changes' }).click()
  await expect(dlg.getByText(/saved/i).first()).toBeVisible()
  await dlg.getByRole('button', { name: /cancel/i }).first().click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page).toHaveURL(/\/admin\/blog$/)
  await expect(page.getByText('E2E smoke post edited').first()).toBeVisible()
  await expect(page.getByText('E2E smoke post', { exact: true })).toHaveCount(0)
})

test('nested views: each child opens its filtered list, marks itself current, and survives refresh and back/forward', async ({ page }) => {
  await login(page)
  const cases = [
    ['Heritage places', 'Published', /\/admin\/heritage\?status=published$/],
    ['Gallery', 'Hidden', /\/admin\/gallery\?status=draft$/],
    ['Gallery', 'Published', /\/admin\/gallery\?status=published$/],
  ]
  for (const [parent, child, url] of cases) {
    const btn = side(page).getByRole('button', { name: parent, exact: true })
    if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click()
    await kid(page, parent, child).click()
    await expect(page).toHaveURL(url)
    await expect(kid(page, parent, child)).toHaveAttribute('aria-current', 'page')
  }
  // refresh keeps the selected child; back returns to the previous one
  await page.reload()
  await expect(kid(page, 'Gallery', 'Published')).toHaveAttribute('aria-current', 'page')
  await page.goBack()
  await expect(page).toHaveURL(/status=draft/)
  await expect(kid(page, 'Gallery', 'Hidden')).toHaveAttribute('aria-current', 'page')
  await page.goForward()
  await expect(kid(page, 'Gallery', 'Published')).toHaveAttribute('aria-current', 'page')
})

test('navigating to a view only filters: no write requests are sent', async ({ page }) => {
  await login(page)
  const writes = []
  page.on('request', (r) => { if (!['GET', 'HEAD'].includes(r.method()) && r.url().includes('/api/')) writes.push(`${r.method()} ${r.url()}`) })
  for (const [parent, child] of [['Blog', 'Published'], ['Gallery', 'Archived']]) {
    const btn = side(page).getByRole('button', { name: parent, exact: true })
    if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click()
    await kid(page, parent, child).click()
    await page.waitForLoadState('networkidle')
  }
  expect(writes).toEqual([])
})

test('my profile: opens from the account button, shows read-only role, closes with Escape', async ({ page }) => {
  await login(page)
  const me = side(page).getByRole('button', { name: /Open my profile/ })
  await expect(me.locator('.mono-avatar')).toBeVisible()
  await me.click()
  const dlg = page.getByRole('dialog', { name: 'My profile' })
  await expect(dlg).toBeVisible()
  await expect(dlg).toContainText(E2E.email)
  await expect(dlg.getByText('Admin', { exact: true })).toBeVisible()
  await expect(dlg.locator('input, select')).toHaveCount(0) // role is displayed, never an input
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
  await expect(me).toBeFocused()
})

// Regression: text fields used to accept a single character because their dialog restored focus on every keystroke.
async function typeInEveryField(page, scope, label) {
  const fields = scope.locator('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]):not([type=submit]):not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])')
  const count = await fields.count()
  expect(count, `${label}: expected some fields`).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    const f = fields.nth(i)
    if (!(await f.isVisible())) continue
    const type = (await f.getAttribute('type')) || 'text'
    if (['date', 'datetime-local', 'time', 'month', 'week', 'range', 'color', 'number'].includes(type)) continue
    await f.click()
    await f.fill('')
    await f.pressSequentially('abcdefghij', { delay: 15 })
    const v = await f.inputValue()
    expect(v, `${label}: field #${i} (${(await f.getAttribute('name')) || (await f.getAttribute('aria-label')) || type}) lost keystrokes`).toBe('abcdefghij')
  }
}

test('every text field in the admin editors accepts full typing', async ({ page }) => {
  await login(page)
  await page.goto('/admin/blog?edit=new')
  await typeInEveryField(page, page.getByRole('dialog'), 'blog editor')
  await page.goto('/admin/heritage?edit=new')
  await typeInEveryField(page, page.getByRole('dialog'), 'heritage editor')
  for (const url of ['/admin/blog', '/admin/heritage', '/admin/gallery', '/admin/students', '/admin?tab=roles', '/admin/activity']) {
    await page.goto(url)
    await expect(page.locator('#adm-main')).toBeVisible()
    await typeInEveryField(page, page.locator('.adm-main .ad-toolbar, .adm-main'), `${url} toolbar`)
  }
  // committee: new committee form and the add-member dialogs
  await page.goto('/admin?tab=committee')
  await expect(page.locator('#adm-main')).toBeVisible()
  const newBtn = page.getByRole('button', { name: /new committee|create/i }).first()
  if (await newBtn.count()) { await newBtn.click(); await typeInEveryField(page, page.locator('.adm-main'), 'committee form') }
  // gallery: new album and image dialogs
  await page.goto('/admin/gallery')
  for (const name of [/new album/i]) {
    const b = page.getByRole('button', { name }).first()
    if (await b.count()) { await b.click(); await typeInEveryField(page, page.getByRole('dialog'), `gallery ${name}`); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeHidden() }
  }
})

test('contact inbox: a public message arrives, is read, marked unread and deleted; no reply from the panel', async ({ page }) => {
  await page.goto('/')
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/v1/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'E2E Visitor', email: 'visitor@example.test', subject: 'Hello from the e2e suite', message: 'Please tell me about the next meetup.' }) })
    return r.status
  })
  expect(res).toBe(201)
  await login(page)
  await side(page).getByRole('button', { name: 'Messages', exact: true }).click()
  await kid(page, 'Messages', 'Inbox').click()
  await expect(page).toHaveURL(/\/admin\/contact$/)
  await expect(page.getByText('Hello from the e2e suite').first()).toBeVisible()
  await page.getByRole('button', { name: 'Open', exact: true }).first().click()
  const dlg = page.getByRole('dialog', { name: 'Message' })
  await expect(dlg).toContainText('visitor@example.test')
  await expect(dlg.getByRole('button', { name: 'Reply', exact: true })).toHaveCount(0)
  await expect(dlg.getByRole('button', { name: 'Archive' })).toHaveCount(0)
  await expect(dlg.getByRole('button', { name: 'Mark as unread' })).toBeVisible() // opening it marked it read
  await dlg.getByRole('button', { name: 'Mark as unread' }).click()
  await expect(dlg.getByRole('button', { name: 'Mark as read' })).toBeVisible()
  await dlg.getByRole('button', { name: 'Mark as read' }).click()
  await expect(dlg.getByRole('button', { name: 'Mark as unread' })).toBeVisible()
  await dlg.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog').last().getByRole('button', { name: 'Delete' }).click()
  await expect(dlg).toBeHidden()
  await expect(page.getByText('Hello from the e2e suite')).toHaveCount(0)
})

test('member directory: verify a record, see the mark, and it persists', async ({ page }) => {
  await login(page)
  await page.goto('/admin/students?tab=imported&status=awaiting')
  const first = page.locator('.dt tbody tr').nth(5)
  const name = (await first.locator('strong').first().innerText()).trim()
  // a record without an email cannot be verified: the button is disabled and says why
  await expect(first.getByRole('button', { name: 'Verify', exact: true })).toBeDisabled()
  await expect(first).toContainText('Add an email before verifying.')
  await first.getByRole('button', { name: /Actions/ }).click()
  await page.getByRole('menuitem', { name: 'Add email address' }).click()
  const ed = page.getByRole('dialog', { name: 'Email address for activation' })
  await ed.locator('input[type=email]').fill('verify.person@example.test')
  await ed.locator('form button').first().click()
  await expect(ed).toBeHidden()
  await page.locator('.dt tbody tr', { hasText: name }).first().getByRole('button', { name: 'Verify', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await expect(dlg).toContainText(name)
  await expect(dlg).toContainText('does not create an account')
  await dlg.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(dlg).toBeHidden()
  // it left "awaiting" and is in "verified", with the mark that explains itself
  await page.getByRole('button', { name: /^Verified/ }).click()
  const row = page.locator('.dt tbody tr', { hasText: name }).first()
  await expect(row.locator('.vmark').first()).toHaveAttribute('title', /directory record, not an account/)
  await expect(row.locator('.vmark').nth(1)).toHaveAttribute('title', 'Email confirmed by an admin') // the saved address is marked too
  await page.reload()
  await expect(page.locator('.dt tbody tr', { hasText: name }).first().locator('.vmark').first()).toBeVisible()
  // removing the verification puts it back
  await page.locator('.dt tbody tr', { hasText: name }).first().getByRole('button', { name: /Actions/ }).click()
  await page.getByRole('menuitem', { name: 'Remove verification' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove verification' }).click()
  await expect(page.getByText('Verification removed.')).toBeVisible()
})

test('admin management lists only administrators and explains who cannot be promoted', async ({ page }) => {
  await login(page)
  await side(page).getByRole('link', { name: 'Admin management' }).click()
  await expect(page.locator('.dt tbody tr')).toHaveCount(1)
  await expect(page.locator('.dt tbody tr').first()).toContainText(E2E.email)
  await page.getByRole('button', { name: 'Promote member' }).click()
  const dlg = page.getByRole('dialog', { name: 'Promote member' })
  await dlg.getByRole('textbox').pressSequentially('e2e-admin', { delay: 10 })
  const row = dlg.locator('.pm-row').first()
  await expect(row).toBeDisabled() // an administrator is listed, with the reason
  await expect(row).toContainText('Already an administrator')
  // any profile detail finds the person: here the mobile number of the admin's own member profile
  const made = await page.request.post('/api/v1/me/profile', { data: { name: 'Test Admin Person', batch: 16, department: 'Finance', session: '2019-20', upazila: 'kasba', union: 'Kuti', phone: '01755501234' } })
  expect([201, 409]).toContain(made.status())
  const phone = (await (await page.request.get('/api/v1/auth/me')).json()).profile.phone
  await dlg.getByRole('textbox').fill('')
  await dlg.getByRole('textbox').pressSequentially(phone, { delay: 5 })
  await expect(dlg.locator('.pm-row').first()).toContainText(E2E.email)
  await expect(dlg.locator('.pm-row').first()).toContainText('Finance')
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
})

test('imported directory: add a record by hand, edit it, delete it; no account is created', async ({ page }) => {
  await login(page)
  await page.goto('/admin/students?tab=imported')
  await page.getByRole('button', { name: 'Add imported member' }).click()
  const dlg = page.getByRole('dialog', { name: 'Add imported member' })
  const nameBox = dlg.locator('input').first()
  await expect(dlg.locator('form button').first()).toBeDisabled() // nothing to save yet
  await nameBox.pressSequentially('Zqxv E2E Person', { delay: 10 })
  await expect(nameBox).toHaveValue('Zqxv E2E Person')
  await dlg.locator('form button').first().click()
  await expect(dlg.getByText('Choose a batch.')).toBeVisible() // field errors come from the server
  await dlg.locator('select').nth(0).selectOption({ index: 3 })
  await dlg.locator('select').nth(1).selectOption({ index: 2 })
  await dlg.locator('input[inputmode=tel]').pressSequentially('01712345678')
  await dlg.locator('form button').first().click()
  await expect(dlg).toBeHidden()
  await expect(page.getByText('No account was created.')).toBeVisible()
  const row = page.locator('.dt tbody tr', { hasText: 'Zqxv E2E Person' })
  await expect(row).toContainText('Added by an admin')
  await row.getByRole('button', { name: /Actions/ }).click()
  await page.getByRole('menuitem', { name: 'Delete record' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete record' }).click()
  await expect(page.getByText('Record deleted.')).toBeVisible()
  await expect(page.locator('.dt tbody tr', { hasText: 'Zqxv E2E Person' })).toHaveCount(0)
})

test('students: a dropdown of three pages (requests, directory, alumni)', async ({ page }) => {
  await login(page)
  const students = side(page).getByRole('button', { name: 'Students', exact: true })
  await expect(students).toHaveAttribute('aria-expanded', 'false')
  await students.click()
  await expect(students).toHaveAttribute('aria-expanded', 'true')
  await expect(side(page).locator('.adm-parent').filter({ has: page.getByRole('button', { name: 'Students', exact: true }) }).locator('.adm-child')).toHaveCount(3)
  const pages = [
    ['Membership Requests', /tab=requests/, ['All pending requests', 'Complete profiles', 'Incomplete profiles'], [/complete=yes/, /complete=no/]],
    ['Membership Directory', /tab=members/, [], []], // Registered members: approved members only, no sub-tabs
  ]
  for (const [label, url, tabs, urls] of pages) {
    await side(page).getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(url)
    await expect(side(page).getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page')
    for (const t of tabs) await expect(page.locator('.ad-view', { hasText: new RegExp(`^${t}`) }).first()).toBeVisible()
    for (let i = 0; i < urls.length; i++) { // the second and third tabs change the address and stay inside this page
      await page.locator('.ad-view', { hasText: new RegExp(`^${tabs[i + 1]}`) }).first().click()
      await expect(page).toHaveURL(urls[i])
      await expect(side(page).getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page')
    }
  }
  await expect(page.locator('[role=group].ad-views .ad-view')).toHaveCount(0)
  // the directory page also holds the original directory records, with their own three tabs
  await page.getByRole('tab', { name: 'Directory records' }).click()
  await expect(page).toHaveURL(/tab=imported/)
  await expect(side(page).getByRole('link', { name: 'Membership Directory', exact: true })).toHaveAttribute('aria-current', 'page')
  for (const t of ['All', 'Needs verification', 'Verified']) await expect(page.locator('.ad-view', { hasText: new RegExp(`^${t}`) }).first()).toBeVisible()
  await page.getByRole('tab', { name: 'Registered members' }).click()
  // the original directory has no accounts to list here, and Members says why
  await expect(page.locator('.dt tbody tr')).toHaveCount(0)
  await expect(page.getByText(/have no email address, so no account can be created/)).toBeVisible()
})

test('activation emails: addresses can be saved, sending is honestly unavailable without the Supabase admin key', async ({ page }) => {
  await login(page)
  await page.goto('/admin/students?tab=imported')
  await expect(page.getByText(/Activation emails are switched off/)).toBeVisible()
  const row = page.locator('.dt tbody tr').first()
  const name = (await row.locator('strong').first().innerText()).trim()
  await row.getByRole('button', { name: /Actions/ }).click()
  await page.getByRole('menuitem', { name: 'Add email address' }).click()
  const dlg = page.getByRole('dialog', { name: 'Email address for activation' })
  await dlg.locator('input[type=email]').pressSequentially('not-an-email', { delay: 5 })
  await dlg.locator('form button').first().click()
  await expect(dlg.getByText('Enter a real email address.')).toBeVisible() // validated by the server
  await dlg.locator('input[type=email]').fill('e2e.person@example.test')
  await dlg.locator('form button').first().click()
  await expect(page.getByText('Nothing has been sent yet.')).toBeVisible()
  const saved = page.locator('.dt tbody tr', { hasText: name }).first()
  await expect(saved).toContainText('Email saved, not sent')
  await saved.getByRole('button', { name: /Actions/ }).click()
  await page.getByRole('menuitem', { name: 'Send activation email' }).click()
  await expect(page.getByText(/Invitations are not configured on the server/)).toBeVisible() // never a false success
  await expect(saved).toContainText('Email saved, not sent')
  // removing the address: a red action with a confirmation, and the record goes back to "no email saved"
  await saved.getByRole('button', { name: /Actions/ }).click()
  const remove = page.getByRole('menuitem', { name: 'Remove email address' })
  await expect(remove).toHaveClass(/danger/)
  await remove.click()
  const confirm = page.getByRole('dialog')
  await expect(confirm.getByRole('button', { name: 'Remove email address' })).toHaveClass(/btn-danger/)
  await confirm.getByRole('button', { name: 'Remove email address' }).click()
  await expect(page.getByText('Email address removed.')).toBeVisible()
  await expect(page.locator('.dt tbody tr', { hasText: name }).first()).toContainText('No email saved')
})

test('activation page: an unusable link explains what to do and never shows success', async ({ page }) => {
  await page.goto('/activate')
  await expect(page.getByRole('heading', { name: 'Activate your account' })).toBeVisible()
  await expect(page.getByText(/not available in this setup|invalid, has expired/)).toBeVisible()
  await expect(page.getByText('Your email address is confirmed.')).toHaveCount(0)
})

test('site data from the database: events, FAQ and alumni are created in the panel and shown on the site', async ({ page }) => {
  test.setTimeout(120000)
  await login(page)
  // event
  await page.goto('/admin/events')
  await page.getByRole('button', { name: 'New event' }).first().click()
  let dlg = page.getByRole('dialog', { name: 'New event' })
  await dlg.getByLabel('Title (English)').fill('E2E Freshers Reception')
  await dlg.getByLabel('Date').first().fill('2031-03-14')
  await dlg.getByLabel('Venue').fill('TSC auditorium')
  await dlg.getByRole('button', { name: 'Save and publish' }).click()
  await expect(dlg).toBeHidden()
  // the events page leads with it (the next event), lists it, and its own page opens
  await page.goto('/events')
  await expect(page.locator('.evp-feature')).toContainText('E2E Freshers Reception')
  await expect(page.locator('.evp-card', { hasText: 'E2E Freshers Reception' })).toContainText('TSC auditorium')
  await page.locator('.evp-card', { hasText: 'E2E Freshers Reception' }).click()
  await expect(page).toHaveURL(/\/events\/e2e-freshers-reception$/)
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Freshers Reception' })).toBeVisible()
  // the home page carousel shows it too
  await page.goto('/')
  await expect(page.locator('.evx-slide', { hasText: 'E2E Freshers Reception' })).toHaveCount(1)
  // feature it from the list, then filter by featured
  await page.goto('/admin/events')
  await page.getByRole('button', { name: /Actions: E2E Freshers Reception/ }).click()
  await page.getByRole('menuitem', { name: 'Feature' }).click()
  await expect(page.getByText('Marked as featured.')).toBeVisible()
  await page.goto('/admin/events?featured=yes')
  await expect(page.getByText('E2E Freshers Reception')).toBeVisible()
  // FAQ
  await page.goto('/admin/faq')
  await expect(page.getByText('Who can join BSWA?').first()).toBeVisible() // the bundled questions were copied to the database
  await page.getByRole('button', { name: 'New question' }).click()
  dlg = page.getByRole('dialog', { name: 'New question' })
  await dlg.getByLabel('Question (English)').fill('Is there an E2E question?')
  await dlg.getByLabel('Answer (English)').fill('Yes, added from the admin panel.')
  await dlg.getByRole('button', { name: 'Save and publish' }).click()
  await expect(dlg).toBeHidden()
  await page.goto('/faq')
  await expect(page.getByText('Is there an E2E question?')).toBeVisible()
  // alumni
  await page.goto('/admin/alumni')
  await page.getByRole('button', { name: 'New alumnus' }).click()
  dlg = page.getByRole('dialog', { name: 'New alumnus' })
  await dlg.getByLabel('Name').first().fill('Zqxv E2E Alumnus')
  await dlg.getByLabel('Workplace').fill('E2E Bank')
  await dlg.getByLabel('Mobile').fill('01712345678')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await expect(dlg).toBeHidden()
  await page.goto('/alumni?q=Zqxv')
  await expect(page.getByText('Zqxv E2E Alumnus')).toBeVisible()
  // contact details: shown to a signed-in member or admin, never to a visitor who is not signed in
  await expect(page.locator('.al-contact')).toContainText('01712345678')
  const guestCtx = await page.context().browser().newContext({ baseURL: new URL(page.url()).origin })
  const guest = await guestCtx.newPage()
  await guest.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en') } catch { /* ignore */ } })
  await guest.goto('/alumni?q=Zqxv')
  await expect(guest.getByText('Zqxv E2E Alumnus')).toBeVisible()
  await expect(guest.getByText('01712345678')).toHaveCount(0)
  await expect(guest.locator('.al-locked')).toContainText('Sign in to see contact details')
  await guestCtx.close()
  // the same email and invitation steps as a directory record
  await page.goto('/admin/alumni?q=Zqxv')
  const arow = page.locator('.dt tbody tr', { hasText: 'Zqxv E2E Alumnus' })
  await expect(arow.getByRole('button', { name: 'Verify', exact: true })).toBeDisabled() // needs an email first
  await arow.getByRole('button', { name: /Actions/ }).click()
  await page.getByRole('menuitem', { name: 'Add email' }).click()
  const edlg = page.getByRole('dialog')
  await edlg.getByLabel('Email').fill('zqxv.alumnus@example.test')
  await edlg.getByRole('button', { name: 'Save' }).click()
  await expect(edlg).toBeHidden()
  await expect(arow).toContainText('zqxv.alumnus@example.test')
  await expect(arow.getByRole('button', { name: 'Verify', exact: true })).toBeEnabled()
  await arow.getByRole('button', { name: 'Verify', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Verify' }).click()
  await expect(arow).toContainText('Verified')
  // and delete it again
  await page.goto('/admin/alumni?q=Zqxv')
  await page.locator('.dt tbody tr', { hasText: 'Zqxv E2E Alumnus' }).getByRole('button', { name: /Actions/ }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Deleted.')).toBeVisible()
  await page.goto('/alumni?q=Zqxv')
  await expect(page.getByText('Zqxv E2E Alumnus')).toHaveCount(0)
})

test('alumni setting: choosing a batch asks once and saves; both admin pages follow it', async ({ page }) => {
  await login(page)
  await page.goto('/admin/alumni')
  const sel = page.locator('#ac-batch')
  const before = await sel.inputValue()
  const next = String(Number(before) + 1)
  await sel.selectOption(next)
  const dlg = page.getByRole('dialog')
  await expect(dlg).toContainText(`Make batches up to ${next} alumni?`)
  await dlg.getByRole('button', { name: 'Yes, save it' }).click()
  await expect(page.getByText(`Saved: alumni up to batch ${next}.`)).toBeVisible()
  // the Membership Directory batch filter offers only the running batches now
  await page.goto('/admin/students?tab=imported')
  await expect(page.locator('.dt tbody tr').first()).toBeVisible()
  const opts = await page.locator('select').filter({ hasText: 'All batches' }).first().locator('option').allTextContents()
  expect(opts.some((o) => o === `Batch ${next}`)).toBe(false)
  // put it back
  await page.goto('/admin/alumni')
  await page.locator('#ac-batch').selectOption(before)
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, save it' }).click()
  await expect(page.getByText(`Saved: alumni up to batch ${before}.`)).toBeVisible()
})

test('heritage places: create, edit, publish to the site, archive, then delete permanently with a double confirmation', async ({ page }) => {
  await login(page)
  const api = (method, path, data) => page.request.fetch(`/api/v1${path}`, { method, data })
  const made = await (await api('POST', '/admin/content/place', { slug: 'e2e-place', data: { nameEn: 'Zqxv E2E Place', nameBn: 'পরীক্ষা স্থান', category: 'park', upazila: 'akhaura', summary: 'First text.' } })).json()
  const got = await (await api('GET', `/admin/content/place/${made.id}`)).json()
  expect((await api('PATCH', `/admin/content/place/${made.id}`, { slug: 'e2e-place', data: { ...got.data, summary: 'Edited text.' }, expectedUpdatedAt: got.updatedAt })).status()).toBe(200)
  expect((await api('POST', `/admin/content/place/${made.id}/publish`, {})).status()).toBe(200)
  // on the site: the heritage list and the upazila page
  await page.goto('/heritage/e2e-place')
  await expect(page.getByText('Edited text.')).toBeVisible()
  await page.goto('/directory/akhaura')
  await expect(page.getByRole('heading', { name: 'Zqxv E2E Place' })).toBeVisible()
  // a published place cannot be deleted outright
  expect((await api('DELETE', `/admin/content/place/${made.id}`)).status()).toBe(409)
  // archive, then delete from the panel: two confirmations
  expect((await api('POST', `/admin/content/place/${made.id}/archive`, {})).status()).toBe(200)
  await page.goto('/admin/heritage?status=archived')
  await page.getByRole('button', { name: /Actions: Zqxv E2E Place/ }).click()
  await page.getByRole('menuitem', { name: 'Delete permanently' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('dialog')).toContainText('this cannot be undone')
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click()
  await expect(page.getByText('Deleted permanently.')).toBeVisible()
  expect((await api('GET', `/admin/content/place/${made.id}`)).status()).toBe(404)
  await page.goto('/heritage/e2e-place')
  await expect(page.getByText('Edited text.')).toHaveCount(0)
})

test('events: past events stay on the home carousel and the events page, after the upcoming ones', async ({ page }) => {
  await login(page)
  const api = (method, path, data) => page.request.fetch(`/api/v1${path}`, { method, data })
  const e = await (await api('POST', '/admin/content/event', { slug: 'e2e-past-meetup', data: { titleEn: 'Zqxv Past Meetup', date: '2020-01-15', venue: 'Old hall' } })).json()
  expect((await api('POST', `/admin/content/event/${e.id}/publish`, {})).status()).toBe(200)
  await page.goto('/')
  const slide = page.locator('.evx-slide', { hasText: 'Zqxv Past Meetup' })
  await expect(slide).toHaveCount(1)
  await expect(slide.locator('.evx-when')).toHaveText('Past')
  await page.goto('/events?when=past')
  await expect(page.locator('.evp-card', { hasText: 'Zqxv Past Meetup' })).toBeVisible()
  // archived, it leaves both; deleted, it is gone from the database
  expect((await api('POST', `/admin/content/event/${e.id}/archive`, {})).status()).toBe(200)
  await page.goto('/')
  await expect(page.locator('.evx-slide', { hasText: 'Zqxv Past Meetup' })).toHaveCount(0)
  expect((await api('DELETE', `/admin/content/event/${e.id}`)).status()).toBe(204)
  expect((await api('GET', `/admin/content/event/${e.id}`)).status()).toBe(404)
})
