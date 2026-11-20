import { test, expect } from '@playwright/test'
import { login } from './session.js'

// Admin pages lead to the right place: a new member goes Requests → approved → Directory, and "View member profile"
// in Admin management opens that person's profile (it used to open Membership Requests).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'en'); localStorage.setItem('jk-theme', 'light') } catch { /* */ } })
})

test('a new member is approved from Requests into the Directory; profile links open the profile, not Requests', async ({ page, browser }) => {
  const visitor = await (await browser.newContext()).newPage()
  const reg = await visitor.request.post('/api/v1/auth/register', { data: { name: 'Links Person', email: 'links.person@example.test', password: 'Links#Person2026', batch: 22, department: 'Finance', upazila: 'nabinagar', session: '2026-27' } })
  expect(reg.status()).toBe(201)
  await login(page)

  await page.goto('/admin/students?tab=requests')
  const row = page.locator('tbody tr', { hasText: 'Links Person' })
  await row.getByRole('button', { name: /^Approve/ }).click()
  const dlg = page.getByRole('dialog')
  if (await dlg.count()) await dlg.getByRole('button', { name: /Approve/ }).last().click()
  await expect(page.locator('tbody tr', { hasText: 'Links Person' })).toHaveCount(0)
  await page.goto('/admin/students?tab=members')
  await expect(page.locator('tbody tr', { hasText: 'Links Person' })).toBeVisible()

  // the page "View member profile" opens for an admin who is a member: their own profile, not Membership Requests
  const users = await (await page.request.get('/api/v1/admin/users?q=links.person')).json()
  const id = users.items[0].id
  expect(users.items[0].memberStatus).toBeTruthy()
  await page.goto(`/admin/profile/m-${id}`)
  await expect(page.getByText('Links Person').first()).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/admin/profile/m-${id}$`))

  // Admin management: "View member profile" is offered only for an admin who has a member profile, and opens it
  const admins = await (await page.request.get('/api/v1/admin/users?role=admin')).json()
  const me = admins.items.find((u) => u.email === 'e2e-admin@example.test')
  await page.goto('/admin?tab=roles')
  await page.locator('tbody tr', { hasText: 'e2e-admin@example.test' }).getByRole('button', { name: /Actions/ }).click()
  const item = page.getByRole('menuitem', { name: 'View member profile' })
  if (me.memberStatus) {
    await item.click()
    await expect(page).toHaveURL(new RegExp(`/admin/profile/m-${me.id}$`))
  } else {
    await expect(item).toHaveCount(0)
    await page.keyboard.press('Escape')
  }

  // tidy up: the member made here is removed again (later tests expect no registered members)
  expect((await page.request.post(`/api/v1/admin/students/${id}/remove`, { data: { confirm: 'links.person@example.test' } })).ok()).toBe(true)
})
