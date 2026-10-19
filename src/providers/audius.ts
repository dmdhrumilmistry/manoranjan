import { getJSON } from '../lib/http'
import { settings } from '../state/settings'
import type { MediaItem } from './types'
import { popularityFrom } from './util'

/**
 * Audius - open, decentralised music platform with a free public API and
 * full-length streams that artists publish themselves. No key needed.
 */
const APP = 'manoranjan'
const DISCOVERY = 'https://api.audius.co'
let hostPromise: Promise<string> | null = null

/** Pick a healthy discovery node once per session; fall back to the gateway itself. */
function host(): Promise<string> {
  hostPromise ??= getJSON<{ data: string[] }>(DISCOVERY, {}, { timeout: 6000 })
    .then((r) => r.data[Math.floor(Math.random() * r.data.length)] ?? DISCOVERY)
    .catch(() => DISCOVERY)
  return hostPromise
}

interface AudiusTrack {
  id: string
  title: string
  genre?: string
  mood?: string
  tags?: string | null
  duration: number
  play_count?: number
  release_date?: string | null
  artwork?: Record<string, string> | null
  user: { name: string; handle: string }
}

export const GENRES = [
  'All', 'Electronic', 'Hip-Hop/Rap', 'Pop', 'Lo-Fi', 'Alternative', 'Rock', 'R&B/Soul', 'Ambient',
  'Jazz', 'Classical', 'World', 'Acoustic', 'Experimental', 'Soundtrack',
] as const

export function trackStreamUrl(item: MediaItem): Promise<string> {
  const id = item.id.replace(/^audius:/, '')
  return host().then((h) => `${h}/v1/tracks/${encodeURIComponent(id)}/stream?app_name=${APP}`)
}

function toItem(t: AudiusTrack): MediaItem {
  return {
    id: `audius:${t.id}`,
    provider: 'audius',
    kind: 'track',
    title: t.title,
    subtitle: t.user.name,
    poster: t.artwork?.['480x480'] ?? t.artwork?.['150x150'],
    duration: t.duration,
    year: t.release_date ? Number(t.release_date.slice(0, 4)) : undefined,
    tags: [t.genre, t.mood, `artist:${t.user.handle}`, ...(t.tags ?? '').split(',')]
      .map((x) => x?.trim() ?? '')
      .filter(Boolean)
      .slice(0, 12),
    popularity: popularityFrom(t.play_count, 1e7),
  }
}

async function call(path: string, params: Record<string, string> = {}): Promise<MediaItem[]> {
  if (!settings().audiusEnabled) return []
  const h = await host()
  const p = new URLSearchParams({ ...params, app_name: APP })
  const r = await getJSON<{ data: AudiusTrack[] }>(`${h}/v1${path}?${p}`)
  return (r.data ?? []).map(toItem)
}

export const audius = {
  trending: (genre?: string) => call('/tracks/trending', genre && genre !== 'All' ? { genre } : {}),
  search: (query: string) => call('/tracks/search', { query }),
  undergroundTrending: () => call('/tracks/trending/underground'),
}
