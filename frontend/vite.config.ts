import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // MapLibre's worker is an ES module (maplibre-gl-worker.mjs imports a shared chunk).
  worker: { format: 'es' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/tiles': 'http://localhost:3000',
      '/media': 'http://localhost:3000',
    },
  },
})
