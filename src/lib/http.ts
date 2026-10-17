/** Minimal JSON fetch with timeout and a short-lived in-memory cache. Sends no cookies or referrer. */
const cache = new Map<string, { at: number; data: unknown }>()
const TTL_MS = 5 * 60_000

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${new URL(url).host}`)
  }
}

export async function getJSON<T>(url: string, init: RequestInit = {}, { ttl = TTL_MS, timeout = 15_000 } = {}): Promise<T> {
  const key = url + JSON.stringify(init.headers ?? {})
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.data as T

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, {
      ...init,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: init.signal ?? ctrl.signal,
    })
    if (!res.ok) throw new HttpError(res.status, url)
    const data = (await res.json()) as T
    cache.set(key, { at: Date.now(), data })
    return data
  } finally {
    clearTimeout(timer)
  }
}
