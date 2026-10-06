import { defineConfig, devices } from '@playwright/test'
import { API_PORT, DATABASE_URL, STORAGE_DIR, WEB_PORT, WEB_URL } from './support/env.js'

const CI = !!process.env.CI

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  // One worker: the specs share one database and reset it per file.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  // No retries: a flaky test must be fixed, not hidden.
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    locale: 'vi-VN',
    timezoneId: 'Europe/Paris',
    // Camera moves become instant (the app honours prefers-reduced-motion), so map assertions do not race animations.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Headless Chromium has no GPU: MapLibre's WebGL runs on SwiftShader.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: /(mobile|a11y)\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: [
    {
      command: 'npx tsx src/server.ts',
      cwd: '../backend',
      // The port, not a URL: the health check needs the database, which global setup may create after this starts.
      port: API_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'production',
        PORT: String(API_PORT),
        DATABASE_URL,
        CORS_ORIGINS: WEB_URL,
        JWT_SECRET: 'e2e-only-secret-not-used-anywhere-else',
        STORAGE_DIR,
        WRITE_RATE_LIMIT: '10000',
      },
    },
    {
      // Production build: no React StrictMode double effects, same bundle as users get (incl. the MapLibre worker).
      command: `npx vite build --mode e2e --outDir dist-e2e && npx vite preview --mode e2e --outDir dist-e2e --port ${WEB_PORT} --strictPort`,
      cwd: '../frontend',
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
})
