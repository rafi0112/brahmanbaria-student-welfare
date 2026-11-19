import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect } from '@playwright/test'
import { E2E } from '../playwright.config.js'

// One sign-in for all the test files that share it: the API limits sign-ins per address, so the cookies of the first
// sign-in in a run are kept in a temporary file and reused. A saved sign-in is checked first: each run starts a fresh test server.
const FILE = path.join(os.tmpdir(), 'bswa-e2e-session.json')

export async function login(page) {
  try {
    const st = fs.statSync(FILE)
    if (Date.now() - st.mtimeMs < 60 * 60 * 1000) {
      await page.context().addCookies(JSON.parse(fs.readFileSync(FILE, 'utf8')))
      if ((await page.request.get('/api/v1/auth/me')).ok()) return // still signed in on this run's server
      await page.context().clearCookies()
    }
  } catch { /* no saved sign-in yet */ }
  await page.goto('/login')
  await page.locator('input[type=email]').fill(E2E.email)
  await page.locator('input[type=password]').fill(E2E.password)
  const [res] = await Promise.all([page.waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST'), page.locator('form button[type=submit]').click()])
  expect(res.status()).toBe(200)
  await page.waitForLoadState('networkidle')
  fs.writeFileSync(FILE, JSON.stringify(await page.context().cookies()))
}
