import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// E2E runs its own backend on another port, next to the dev one.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  // MapLibre's worker is an ES module (maplibre-gl-worker.mjs imports a shared chunk).
  worker: { format: 'es' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/tiles': apiTarget,
      '/media': apiTarget,
    },
  },
})
