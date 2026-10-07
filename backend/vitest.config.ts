import os from 'node:os'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

// config/env.ts validates process.env on import, so every test process gets a complete, harmless environment.
// The unit project never opens a connection: DATABASE_URL points nowhere on purpose. The integration project replaces
// it with the Testcontainers database (test/integration/globalSetup.ts).
const testEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://unit:unit@127.0.0.1:1/unit_tests_do_not_connect',
  BETTER_AUTH_SECRET: 'test-only-secret-with-at-least-32-characters',
  PUBLIC_ORIGIN: 'http://localhost:5173',
  STORAGE_DIR: path.join(os.tmpdir(), `pmv-test-storage-${process.pid}`),
}

export default defineConfig({
  test: {
    env: testEnv,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'db/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/integration/globalSetup.ts'],
          setupFiles: ['test/integration/setupDatabaseEnv.ts'],
          // One database for the whole run: test files take turns instead of racing on the same tables.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'db/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        'db/migrations/**',
        'db/seeds/**',
        'db/import/run.ts',
        'db/import/report.ts',
        'src/server.ts',
      ],
      reporter: ['text-summary', 'html', 'json-summary'],
    },
  },
})
