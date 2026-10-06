// Direct calls to the E2E backend, for setting up data a spec needs (e.g. community photos) without clicking through.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { request } from '@playwright/test'
import { API_PORT } from './env.js'

const API_URL = `http://localhost:${API_PORT}/api/v1`

export async function uploadPhoto(spotId: string, file: string, fields: Record<string, string> = {}): Promise<void> {
  const api = await request.newContext()
  try {
    const res = await api.post(`${API_URL}/photos`, {
      multipart: {
        spot_id: spotId,
        ...fields,
        file: { name: path.basename(file), mimeType: 'image/jpeg', buffer: await readFile(file) },
      },
    })
    if (!res.ok()) throw new Error(`upload failed: HTTP ${res.status()} ${await res.text()}`)
  } finally {
    await api.dispose()
  }
}
