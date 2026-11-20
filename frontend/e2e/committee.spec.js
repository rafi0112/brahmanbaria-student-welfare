import { test, expect } from '@playwright/test'
import { E2E } from '../playwright.config.js'
import { login } from './session.js'

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
  // who they are and a message, for their pop-up on the Committee page
  await f().getByLabel(/^বিভাগ$|^Department$/).fill('ব্যবস্থাপনা')
  await f().getByLabel(/^ব্যাচ$|^Batch$/).fill('14')
  await f().getByLabel(/^সেশন$|^Session$/).fill('2018-19')
  await f().getByLabel(/^উপজেলা$|^Upazila$/).fill('নবীনগর')
  await f().getByLabel(/^মতামত|^Message/).fill('নবীনদের প্রতি শুভেচ্ছা। পরিষদ সবার।')
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

  // a click on any member (a card, a lead card or an advisor row) opens their details in the pop-up, over the list
  for (const who of ['সুমন সরকার', 'অধ্যাপক মোহাম্মদ শফিকুল ইসলাম']) {
    await page.locator('.cm-group').getByRole('link', { name: who }).click()
    const dlg = page.getByRole('dialog', { name: who })
    await expect(dlg).toBeVisible()
    await expect(dlg.locator('h1')).toContainText(who)
    await expect(dlg).toContainText('কার্যনির্বাহী কমিটি ২০২৬-২০২৭')
    if (who === 'সুমন সরকার') {
      await expect(dlg.locator('.cm-message blockquote')).toContainText('নবীনদের প্রতি শুভেচ্ছা। পরিষদ সবার।')
      for (const x of ['ব্যবস্থাপনা', '১৪', '2018-19', 'নবীনগর']) await expect(dlg.locator('.sp-facts').first()).toContainText(x)
    }
    await expect(page).toHaveURL(/\/committee\?profile=/)
    await page.keyboard.press('Escape')
    await expect(dlg).toBeHidden()
    await expect(page).toHaveURL(/\/committee$/)
  }
  // the whole card is the click target, not only the name
  await page.locator('.cm-group').nth(2).locator('.advisor-row').first().click({ position: { x: 8, y: 8 } })
  await expect(page.getByRole('dialog')).toContainText('মোঃ সালাহ্ উদ্দিন')
})

test('register shows the optional profile photo link field', async ({ page }) => {
  await page.goto('/register')
  await expect(page.getByLabel(/প্রোফাইল ছবির লিংক|Profile photo link/)).toBeVisible()
})

test('committee: next year drafted in both languages, published (the old one is archived), and an archived one restored', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  await page.goto('/admin?tab=committee')
  const f = () => page.locator('form.cm-form').first()

  // next year's committee, drafted while this year's stays on the site
  await page.getByRole('button', { name: /নতুন কমিটি|New committee/ }).click()
  await f().getByLabel(/কমিটির নাম|Committee name/).fill('কার্যনির্বাহী কমিটি ২০২৭-২০২৮')
  await f().getByLabel(/মেয়াদ|Term/).fill('২০২৭–২০২৮')
  await f().getByRole('tab', { name: 'English' }).click()
  await f().getByLabel(/Committee name.*English|কমিটির নাম.*English/).fill('Executive Committee 2027-28')
  await f().getByLabel(/Term.*English|মেয়াদ.*English/).fill('2027–28')
  await f().getByRole('button', { name: /^সংরক্ষণ|^Save/ }).click()
  await expect(page.locator('.cm-head h3')).toContainText('কার্যনির্বাহী কমিটি ২০২৭-২০২৮')
  await page.getByRole('button', { name: /সদস্য যোগ করুন|Add executive/ }).click()
  await f().getByLabel(/অ্যাকাউন্ট নেই|no account/).check()
  await f().getByLabel(/^নাম$|^Name$/).fill('রাফি আহমেদ')
  await f().getByLabel(/^পদবি|^Designation/).fill('সভাপতি')
  await f().getByLabel(/ইংরেজিতে পদবি|Designation in English/).fill('President')
  await f().getByRole('button', { name: /^সংরক্ষণ|^Save/ }).click()
  await expect(page.locator('.exec-row', { hasText: 'রাফি আহমেদ' })).toBeVisible()

  // publish it: the site shows it, and the earlier published one is archived
  await page.getByRole('button', { name: /প্রকাশ করুন|Publish/ }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: /প্রকাশ করুন|Publish/ }).click()
  await expect(page.getByRole('button', { name: /প্রকাশ বন্ধ করুন|Unpublish/ }).first()).toBeVisible()
  const pub = await (await page.request.get('/api/v1/executive-committee')).json()
  expect(pub.committee.name).toBe('কার্যনির্বাহী কমিটি ২০২৭-২০২৮')
  const list = await (await page.request.get('/api/v1/admin/committees')).json()
  const older = list.items.find((c) => c.name === 'কার্যনির্বাহী কমিটি ২০২৬-২০২৭')
  if (older) expect(older.status).toBe('archived')

  // the English site shows the English texts
  await page.goto('/committee')
  await page.locator('.lang-seg').first().click() // to English
  await expect(page.getByRole('heading', { name: 'Executive Committee 2027-28' })).toBeVisible()
  await expect(page.locator('.cm-group').first()).toContainText('President')
  await page.locator('.lang-seg').first().click() // back to Bangla

  // an archived committee can be restored as a draft and edited again
  if (older) {
    await page.goto('/admin?tab=committee')
    await page.locator('.cm-side, aside').getByText('কার্যনির্বাহী কমিটি ২০২৬-২০২৭').first().click()
    await page.getByRole('button', { name: /খসড়া হিসেবে ফিরিয়ে আনুন|Restore as a draft/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: /খসড়া হিসেবে ফিরিয়ে আনুন|Restore as a draft/ }).click()
    await expect(page.locator('.cm-head')).toContainText(/খসড়া|Draft/)
    await expect(page.getByRole('button', { name: /সদস্য যোগ করুন|Add executive/ })).toBeVisible()
  }
})
