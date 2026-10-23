import { test, expect } from '@playwright/test'
import { E2E } from '../playwright.config.js'

// The executive committee is built in the admin panel and appears, grouped, on the public page.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('jk-lang', 'bn'); localStorage.setItem('jk-theme', 'light') } catch { /* ignore */ } })
})

const SEATS = [
  ['মোঃ মনিরুজ্জামান দিমন', 'সভাপতি'],
  ['সুমন সরকার', 'সাধারণ সম্পাদক'],
  ['অধ্যাপক মোহাম্মদ শফিকুল ইসলাম', 'সম্মানিত শিক্ষক উপদেষ্টা'],
  ['মোঃ সালাহ্ উদ্দিন', 'সম্মানিত ছাত্র উপদেষ্টা (সাবেক ছাত্র, জবি)'],
]

test('committee: create, describe, add seats without accounts, edit, reorder, publish, and see it grouped publicly', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login')
  await page.locator('input[type=email]').fill(E2E.email)
  await page.locator('input[type=password]').fill(E2E.password)
  await page.locator('form button[type=submit]').click()
  await page.waitForURL((u) => u.pathname === '/')
  await page.goto('/admin?tab=committee')
  const f = () => page.locator('form.cm-form').first()

  await page.getByRole('button', { name: /নতুন কমিটি|New committee/ }).click()
  await f().getByLabel(/কমিটির নাম|Committee name/).fill('কার্যনির্বাহী কমিটি ২০২৬-২০২৭')
  await f().getByLabel(/মেয়াদ|Term/).fill('২০২৬–২০২৭')
  await f().getByLabel(/পরিচিতি|Introduction/).fill('জগন্নাথ বিশ্ববিদ্যালয়ের ২০২৬–২০২৭ কার্যনির্বাহী কমিটি।')
  await f().getByRole('button', { name: /^সংরক্ষণ|^Save/ }).click()
  await expect(page.getByText('কার্যনির্বাহী কমিটি ২০২৬-২০২৭').first()).toBeVisible()

  for (const [name, role] of SEATS) {
    await page.getByRole('button', { name: /সদস্য যোগ করুন|Add executive/ }).click()
    await f().getByLabel(/অ্যাকাউন্ট নেই|no account/).check()
    await f().getByLabel(/^নাম$|^Name$/).fill(name)
    await f().getByLabel(/^পদবি|^Designation/).fill(role)
    await f().getByRole('button', { name: /^সংরক্ষণ|^Save/ }).click()
    await expect(page.locator('.exec-row', { hasText: name })).toBeVisible()
  }
  await expect(page.locator('.exec-row')).toHaveCount(SEATS.length)

  // edit one seat's designation, then move the second seat up
  const second = page.locator('.exec-row', { hasText: 'সুমন সরকার' })
  await second.getByRole('button', { name: /সম্পাদনা|Edit/ }).click()
  await f().getByLabel(/^পদবি|^Designation/).fill('সাধারণ সম্পাদক (ভারপ্রাপ্ত)')
  await f().getByRole('button', { name: /^সংরক্ষণ|^Save/ }).click()
  await expect(page.locator('.exec-row', { hasText: 'সাধারণ সম্পাদক (ভারপ্রাপ্ত)' })).toBeVisible()
  await page.locator('.exec-row', { hasText: 'সুমন সরকার' }).getByRole('button', { name: /ওপরে নিন|Move up/ }).click()
  await expect(page.locator('.exec-row').first()).toContainText('সুমন সরকার')

  // publish
  await page.getByRole('button', { name: /প্রকাশ করুন|Publish/ }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: /প্রকাশ করুন|Publish/ }).click()
  await expect(page.getByRole('button', { name: /প্রকাশ বন্ধ করুন|Unpublish/ }).first()).toBeVisible()

  // the public page shows the introduction and three groups
  await page.goto('/committee')
  await expect(page.getByText('জগন্নাথ বিশ্ববিদ্যালয়ের ২০২৬–২০২৭ কার্যনির্বাহী কমিটি।')).toBeVisible()
  await expect(page.locator('.cm-group')).toHaveCount(3)
  await expect(page.locator('.cm-group').nth(0)).toContainText('সুমন সরকার')
  await expect(page.locator('.cm-group').nth(1)).toContainText('অধ্যাপক মোহাম্মদ শফিকুল ইসলাম')
  await expect(page.locator('.cm-group').nth(2)).toContainText('মোঃ সালাহ্ উদ্দিন')
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/committee-public.png`, fullPage: true })
})

test('register shows the optional profile photo link field', async ({ page }) => {
  await page.goto('/register')
  await expect(page.getByLabel(/প্রোফাইল ছবির লিংক|Profile photo link/)).toBeVisible()
})
