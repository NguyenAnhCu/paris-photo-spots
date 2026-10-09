// Starts one PostGIS container for the integration project and migrates it. The image tag is the one used locally and
// in docker-compose.yml, so SQL behaves the same everywhere.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'

const POSTGIS_IMAGE = 'postgis/postgis:17-3.4'
const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

let container: StartedPostgreSqlContainer | undefined

export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer(POSTGIS_IMAGE)
    .withDatabase('pmv_test')
    .withUsername('pmv')
    .withPassword('pmv')
    .start()
  const url = container.getConnectionUri()
  // Handed to the workers through provide/inject (setupDatabaseEnv.ts): the config's `env` would override a plain
  // process.env assignment here.
  project.provide('databaseUrl', url)
  execFileSync('npx', ['node-pg-migrate', 'up', '--migrations-dir', 'db/migrations'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })
}

export async function teardown() {
  await container?.stop()
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}
