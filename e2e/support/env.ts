// Ports and paths of the E2E stack. Ports differ from the dev servers (3000 / 5173) so both can run side by side.
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ROOT_DIR = path.resolve(E2E_DIR, '..')

export const API_PORT = 3100
export const WEB_PORT = 4174
export const WEB_URL = `http://localhost:${WEB_PORT}`

// Its own database next to the dev one (docker-compose, port 5433); CI points this at its service container.
export const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://pmv:pmv@localhost:5433/pmv_e2e'

// Uploaded photos and generated test images live outside the repo and the dev storage.
export const TMP_DIR = path.join(os.tmpdir(), 'pmv-e2e')
export const STORAGE_DIR = path.join(TMP_DIR, 'storage')
export const IMAGES_DIR = path.join(TMP_DIR, 'images')
