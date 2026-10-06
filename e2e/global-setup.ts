// Runs once per `playwright test`: test images, then the E2E database (created if missing, migrated).
// Each spec file resets and seeds the data itself (useFreshDatabase in support/test.ts).
import { mkdir } from 'node:fs/promises'
import { prepareDatabase } from './support/db.js'
import { STORAGE_DIR } from './support/env.js'
import { makeImages } from './support/images.js'

export default async function globalSetup() {
  await mkdir(STORAGE_DIR, { recursive: true })
  await makeImages()
  await prepareDatabase()
}
