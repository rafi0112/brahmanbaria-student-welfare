import { test, expect } from '@playwright/test'
import { E2E } from '../playwright.config.js'

// Runs against the isolated in-memory API (see playwright.config.js). English UI so labels are stable.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* ignore */ } })
})

async function login(page) {
  await page.goto('/login')
  await page.locator('input[type=email]').fill(E2E.email)
  await page.locator('input[type=password]').fill(E2E.password)
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST'),
    page.locator('form button[type=submit]').click(),
  ])
  expect(res.status(), 'sign-in against the isolated API').toBe(200)
  await page.waitForLoadState('networkidle')
  await page.goto('/admin')
  await expect(page.locator('#adm-main')).toBeVisible()
}

const side = (page) => page.locator('.adm-side')
// a child link inside one section ("Published" exists under both Blog and Gallery)
const kid = (page, parent, name) => side(page).locator('.adm-parent').filter({ has: page.getByRole('button', { name: parent, exact: true }) }).getByRole('link', { name, exact: true })

test('admin shell: one sidebar, no public navigation', async ({ page }) => {
  await login(page)
  await expect(page.locator('header.site-header, .site-header')).toHaveCount(0)
  for (const label of ['Dashboard', 'Activity', 'Executive Committee', 'Heritage places']) {
    await expect(side(page).getByRole('link', { name: label })).toBeVisible()
  }
  for (const label of ['Students', 'Admin management', 'Blog', 'Gallery']) {
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
  await expect(side(page).getByRole('link', { name: 'Heritage places' })).toBeHidden()
  await page.goto('/admin/blog?status=draft') // the group holding the current page opens itself
  await expect(content).toHaveAttribute('aria-expanded', 'true')
  await expect(kid(page, 'Blog', 'Draft')).toHaveAttribute('aria-current', 'page')
})

test('favorites: star a page, make a folder, move it in, and everything survives a reload', async ({ page }) => {
  await login(page)
  await page.goto('/admin/students')
  await page.getByRole('button', { name: 'Add to favorites' }).click()
  await page.getByRole('dialog', { name: 'Add to favorites' }).getByRole('button', { name: 'Add', exact: true }).click()
  await expect(side(page).locator('.fav-link', { hasText: 'Students' })).toBeVisible()

  await side(page).getByRole('button', { name: 'New folder' }).click()
  await page.keyboard.type('Weekly review')
  await page.keyboard.press('Enter')
  const folder = side(page).locator('.fav-folder', { hasText: 'Weekly review' })
  await expect(folder).toBeVisible()
  await expect(folder.getByText('Empty folder')).toBeVisible()

  await side(page).locator('.fav-row', { hasText: 'Students' }).last().getByRole('button', { name: /Actions/ }).click({ force: true })
  await page.getByRole('menuitem', { name: 'Move to Weekly review' }).click()
  await expect(folder.locator('.fav-link', { hasText: 'Students' })).toBeVisible()

  await page.reload()
  await expect(side(page).locator('.fav-folder', { hasText: 'Weekly review' }).locator('.fav-link', { hasText: 'Students' })).toBeVisible()

  // removing the shortcut does not touch any data
  await side(page).locator('.fav-row', { hasText: 'Students' }).last().getByRole('button', { name: /Actions/ }).click({ force: true })
  await page.getByRole('menuitem', { name: 'Remove from favorites' }).click()
  await expect(side(page).locator('.fav-link', { hasText: 'Students' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible()
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
  await side(page).getByRole('link', { name: 'Heritage places' }).click()
  await expect(page).toHaveURL(/\/admin\/heritage/)
  await expect(page.locator('.adm')).toHaveAttribute('data-open', 'false')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('blog: a new draft is saved and listed', async ({ page }) => {
  await login(page)
  await page.goto('/admin/blog/new')
  await page.getByLabel('Title', { exact: false }).first().fill('E2E smoke post')
  await page.getByRole('button', { name: /save draft|save/i }).first().click()
  await page.goto('/admin/blog')
  await expect(page.getByText('E2E smoke post').first()).toBeVisible()
})

test('nested views: each child opens its filtered list, marks itself current, and survives refresh and back/forward', async ({ page }) => {
  await login(page)
  const cases = [
    ['Students', 'Pending', /\/admin\/students\?status=pending$/],
    ['Students', 'Incomplete profiles', /\/admin\/students\?complete=no$/],
    ['Admin management', 'Admin', /\/admin\?tab=roles&role=admin$/],
    ['Admin management', 'Member', /\/admin\?tab=roles&role=member$/],
    ['Blog', 'Draft', /\/admin\/blog\?status=draft$/],
    ['Blog', 'Archived', /\/admin\/blog\?status=archived$/],
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
  for (const [parent, child] of [['Students', 'Pending'], ['Blog', 'Published'], ['Gallery', 'Archived'], ['Admin management', 'Admin']]) {
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
