import { getJSON } from '../lib/http'
import { settings } from '../state/settings'
import type { MediaItem, VideoProvider } from './types'

/**
 * TMDB — metadata, artwork, trailers and *legal* "where to watch" offers
 * (JustWatch data). TMDB does not host video, so this provider never streams;
 * the detail page links out to licensed services instead.
 *
 * Native ids: "movie-<id>" | "tv-<id>".
 */
const API = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'

const GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller',
  10752: 'War', 37: 'Western', 10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
  10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
}

interface TmdbResult {
  id: number
  media_type?: 'movie' | 'tv' | 'person'
  title?: string
  name?: string
  overview?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  backdrop_path?: string | null
  genre_ids?: number[]
  genres?: { id: number; name: string }[]
  popularity?: number
  original_language?: string
  runtime?: number
  episode_run_time?: number[]
}

export interface WatchOffer {
  provider: string
  logo: string
  type: 'flatrate' | 'free' | 'ads' | 'rent' | 'buy'
}

export interface TmdbExtras {
  trailerKey?: string
  offers: WatchOffer[]
  offersLink?: string
  similar: MediaItem[]
}

/** v4 read tokens are JWTs; v3 keys are 32 hex chars. */
function auth(): { qs: string; headers: HeadersInit } {
  const key = settings().tmdbKey.trim()
  return key.includes('.')
    ? { qs: '', headers: { Authorization: `Bearer ${key}` } }
    : { qs: `api_key=${encodeURIComponent(key)}`, headers: {} }
}

function call<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const a = auth()
  const p = new URLSearchParams(params)
  const qs = [a.qs, p.toString()].filter(Boolean).join('&')
  return getJSON<T>(`${API}${path}?${qs}`, { headers: a.headers })
}

function toItem(r: TmdbResult, fallback: 'movie' | 'tv'): MediaItem {
  const type = r.media_type === 'tv' || r.media_type === 'movie' ? r.media_type : fallback
  const genres = r.genres?.map((g) => g.name) ?? r.genre_ids?.map((g) => GENRES[g]).filter((g): g is string => !!g) ?? []
  const date = r.release_date || r.first_air_date
  return {
    id: `tmdb:${type}-${r.id}`,
    provider: 'tmdb',
    kind: type === 'tv' ? 'series' : 'movie',
    title: r.title || r.name || 'Untitled',
    description: r.overview,
    year: date ? Number(date.slice(0, 4)) : undefined,
    poster: r.poster_path ? `${IMG}/w342${r.poster_path}` : undefined,
    backdrop: r.backdrop_path ? `${IMG}/w1280${r.backdrop_path}` : undefined,
    tags: [...genres, r.original_language ? `lang:${r.original_language}` : ''].filter(Boolean),
    popularity: r.popularity ? Math.min(1, Math.log10(1 + r.popularity) / 3.5) : undefined,
    duration: (r.runtime ?? r.episode_run_time?.[0]) ? (r.runtime ?? r.episode_run_time![0]!) * 60 : undefined,
  }
}

const parse = (nativeId: string): ['movie' | 'tv', string] => {
  const [t, id] = nativeId.split('-')
  return [t === 'tv' ? 'tv' : 'movie', id ?? '']
}

export const tmdb: VideoProvider & { extras(nativeId: string): Promise<TmdbExtras> } = {
  id: 'tmdb',
  name: 'TMDB',
  enabled: () => !!settings().tmdbKey.trim(),

  async trending(kind) {
    const t = kind === 'series' ? 'tv' : 'movie'
    const r = await call<{ results: TmdbResult[] }>(`/trending/${t}/week`)
    return r.results.map((x) => toItem(x, t))
  },

  async search(q) {
    const r = await call<{ results: TmdbResult[] }>('/search/multi', { query: q, include_adult: 'false' })
    return r.results.filter((x) => x.media_type !== 'person').map((x) => toItem(x, 'movie'))
  },

  async details(nativeId) {
    const [t, id] = parse(nativeId)
    return toItem(await call<TmdbResult>(`/${t}/${id}`), t)
  },

  async extras(nativeId) {
    const [t, id] = parse(nativeId)
    const r = await call<{
      videos?: { results: { key: string; site: string; type: string; official?: boolean }[] }
      'watch/providers'?: { results: Record<string, Record<string, unknown> & { link?: string }> }
      recommendations?: { results: TmdbResult[] }
    }>(`/${t}/${id}`, { append_to_response: 'videos,watch/providers,recommendations' })

    const vids = (r.videos?.results ?? []).filter((v) => v.site === 'YouTube')
    const trailer = vids.find((v) => v.type === 'Trailer' && v.official) ?? vids.find((v) => v.type === 'Trailer') ?? vids[0]

    const region = r['watch/providers']?.results?.[settings().region.toUpperCase()]
    const offers: WatchOffer[] = []
    for (const type of ['flatrate', 'free', 'ads', 'rent', 'buy'] as const) {
      const list = (region?.[type] as { provider_name: string; logo_path: string }[] | undefined) ?? []
      for (const p of list)
        if (!offers.some((o) => o.provider === p.provider_name))
          offers.push({ provider: p.provider_name, logo: `${IMG}/w92${p.logo_path}`, type })
    }
    return {
      trailerKey: trailer?.key,
      offers,
      offersLink: region?.link,
      similar: (r.recommendations?.results ?? []).map((x) => toItem(x, t)),
    }
  },
}
