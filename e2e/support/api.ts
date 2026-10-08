// Direct calls to the E2E backend, for setting up data a spec needs (e.g. community photos) without clicking through.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { request } from '@playwright/test'
import { query } from './db.js'
import { API_PORT, WEB_URL } from './env.js'

const API = `http://localhost:${API_PORT}`
const TERMS_VERSION = 'draft-1'

// Uploads as a fresh anonymous participant (like a visitor's first post), renamed to `author` when given so pages
// show a known name. Anonymous posts wait for review: the photo is approved directly in the database unless the spec
// wants it pending. Returns the photo id.
export async function uploadPhoto(
  spotId: string,
  file: string,
  {
    author,
    pending,
    ...exif
  }: { author?: string; pending?: boolean } & Record<string, string | boolean | undefined> = {},
): Promise<string> {
  // Same Origin as the web app: the API refuses writes from other origins.
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { Origin: WEB_URL } })
  try {
    const ok = async (res: Awaited<ReturnType<typeof api.post>>) => {
      if (!res.ok()) throw new Error(`${res.url()}: HTTP ${res.status()} ${await res.text()}`)
    }
    await ok(await api.post('/api/auth/sign-in/anonymous', { data: {}, headers: { 'x-ui-lang': 'vi' } }))
    await ok(await api.post('/api/v1/me/terms', { data: { version: TERMS_VERSION } }))
    if (author) await ok(await api.post('/api/v1/me/update', { data: { name: author } }))
    const fields = Object.fromEntries(
      Object.entries(exif).filter((e): e is [string, string] => typeof e[1] === 'string'),
    )
    const res = await api.post('/api/v1/photos', {
      multipart: {
        spot_id: spotId,
        ...fields,
        file: { name: path.basename(file), mimeType: 'image/jpeg', buffer: await readFile(file) },
      },
    })
    await ok(res)
    const { id } = (await res.json()) as { id: string }
    if (!pending) await query("UPDATE photos SET status = 'approved' WHERE id = $1", [id])
    return id
  } finally {
    await api.dispose()
  }
}
