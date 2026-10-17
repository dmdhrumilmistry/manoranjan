export type MediaKind = 'movie' | 'series' | 'episode' | 'track'

/** Provider-neutral catalogue entry. `id` is globally unique: `${provider}:${nativeId}`. */
export interface MediaItem {
  id: string
  provider: ProviderId
  kind: MediaKind
  title: string
  subtitle?: string
  description?: string
  year?: number
  poster?: string
  backdrop?: string
  /** Free-form descriptors (genres, subjects, artist, mood…) used by the recommender. */
  tags: string[]
  /** Seconds, when known. */
  duration?: number
  /** 0..1 popularity hint from the provider, when known. */
  popularity?: number
}

export interface StreamSource {
  url: string
  /** `hls` streams are played through hls.js where the browser lacks native support. */
  type: 'hls' | 'file'
  mime?: string
  label?: string
  subtitles?: { src: string; lang: string; label: string }[]
}

export interface Episode {
  id: string
  title: string
  season?: number
  number?: number
  thumbnail?: string
}

export type ProviderId = 'archive' | 'jellyfin' | 'tmdb' | 'audius' | 'url'

export interface VideoProvider {
  id: ProviderId
  name: string
  enabled(): boolean
  trending(kind: 'movie' | 'series'): Promise<MediaItem[]>
  search(query: string): Promise<MediaItem[]>
  details(nativeId: string): Promise<MediaItem | null>
  episodes?(nativeId: string): Promise<Episode[]>
  /** Resolve something playable. `nativeId` may be an episode id for series. */
  stream?(nativeId: string): Promise<StreamSource[]>
}

export const splitId = (id: string): [ProviderId, string] => {
  const i = id.indexOf(':')
  return [id.slice(0, i) as ProviderId, id.slice(i + 1)]
}
