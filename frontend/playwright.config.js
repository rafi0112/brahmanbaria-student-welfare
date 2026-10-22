import { defineConfig } from '@playwright/test'

// The suite never touches the real database or Supabase: the API runs with an in-memory store on port 8090
// (JK_NO_DOTENV skips backend/.env) and the dev server runs with empty Supabase settings so the app uses the API's own sign-in.
// It uses the Chrome or Edge already installed on the machine, so nothing needs downloading.
const API = 8090
const WEB = 5199
export const E2E = { email: 'e2e-admin@example.test', password: 'e2e-only-password-123' }

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${WEB}`, channel: process.env.E2E_CHANNEL || 'chrome', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'go run .',
      cwd: '../backend',
      port: API,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        JK_NO_DOTENV: '1', PORT: String(API), AUTH_DEV_MEMORY: 'true', APP_ENV: 'development', DATABASE_URL: '',
        ADMIN_EMAIL: E2E.email, ADMIN_PASSWORD: E2E.password, CORS_ORIGIN: `http://localhost:${WEB}`,      },
    },
    {
      command: 'npx vite --host localhost',
      port: WEB,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { JK_E2E_PORT: String(WEB), JK_E2E_API: `http://localhost:${API}`, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_API_BASE: '' },
    },
  ],
})
