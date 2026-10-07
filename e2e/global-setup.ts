// Runs once per `playwright test`: test images. The database is prepared before the backend starts (prepare-db.ts).
// Each spec file resets and seeds the data itself (useFreshDatabase in support/test.ts).
import { mkdir } from 'node:fs/promises'
import { STORAGE_DIR } from './support/env.js'
import { makeImages } from './support/images.js'

export default async function globalSetup() {
  await mkdir(STORAGE_DIR, { recursive: true })
  await makeImages()
}
