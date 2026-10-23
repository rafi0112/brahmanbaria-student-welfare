import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// JK_E2E_API / JK_E2E_PORT let the browser tests run the app against an isolated in-memory API on other ports.
export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  // Cloudflare Pages (CF_PAGES=1) only serves static files: without VITE_API_BASE every /api request would get
  // index.html back, so refuse to build instead of shipping a site with no data.
  if (command === 'build' && env.CF_PAGES && !env.VITE_API_BASE) {
    throw new Error('VITE_API_BASE is not set. Add it in Cloudflare Pages > Settings > Variables (the Go API address, e.g. https://api.example.com) and redeploy.')
  }
  if (command === 'build' && env.VITE_API_BASE && !/^https?:\/\/[^/]+$/.test(env.VITE_API_BASE)) {
    throw new Error('VITE_API_BASE must be the API origin only, like https://api.example.com (no trailing slash, no /api/v1).')
  }
  return {
    plugins: [react()],
    server: { port: Number(process.env.JK_E2E_PORT) || 5173, proxy: { '/api': process.env.JK_E2E_API || 'http://localhost:8080' } },
  }
})
