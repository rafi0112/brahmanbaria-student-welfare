import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// JK_E2E_API / JK_E2E_PORT let the browser tests run the app against an isolated in-memory API on other ports.
export default defineConfig({
  plugins: [react()],
  server: { port: Number(process.env.JK_E2E_PORT) || 5173, proxy: { '/api': process.env.JK_E2E_API || 'http://localhost:8080' } },
})
