// Cloudflare Turnstile (bot check) before creating an anonymous identity or using a recovery code. Off unless
// VITE_TURNSTILE_SITE_KEY is set (dev and E2E run without it; the backend skips the check without its secret too).
type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  execute: (widget: string) => void
  remove: (widget: string) => void
}
declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<Turnstile> | undefined

function load(): Promise<Turnstile> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile missing')))
    script.onerror = () => reject(new Error('Turnstile failed to load'))
    document.head.appendChild(script)
  })
  return loading
}

export async function captchaToken(
  siteKey: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY,
): Promise<string | undefined> {
  if (!siteKey) return undefined
  const turnstile = await load()
  const host = document.createElement('div')
  host.className = 'turnstile-host'
  document.body.appendChild(host)
  try {
    return await new Promise<string>((resolve, reject) => {
      // Shown only if Cloudflare needs the visitor to click; usually solves itself.
      const widget = turnstile.render(host, {
        sitekey: siteKey,
        execution: 'execute',
        appearance: 'interaction-only',
        callback: resolve,
        'error-callback': () => reject(new Error('Turnstile check failed')),
      })
      turnstile.execute(widget)
    })
  } finally {
    host.remove()
  }
}
