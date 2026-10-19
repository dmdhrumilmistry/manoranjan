import type { Episode, MediaItem, StreamSource, VideoProvider } from './types'
import { plainText } from './util'
import { embedUrl, parseYouTube, ytThumb } from '../lib/youtube'

/**
 * AniList - the open anime database (public GraphQL API, no key, CORS-enabled).
 * Supplies the anime catalogue and each title's *legal* streaming links. When a
 * rights holder publishes a title free on YouTube (Muse Asia, Ani-One, TMS…),
 * AniList lists it and we play it in the privacy-enhanced YouTube embed.
 *
 * Native ids: "<anilistId>" for a title, "<anilistId>/<youtubeVideoId>" for an episode.
 */
const API = 'https://graphql.anilist.co'
const TTL = 10 * 60_000
const cache = new Map<string, { at: number; data: unknown }>()

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const key = query + JSON.stringify(variables)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.data as T
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
  const json = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] }
  if (res.status === 429) throw new Error('AniList is busy (rate limit). Please wait a minute and try again.')
  if (!res.ok || json.errors?.length || !json.data) throw new Error(json.errors?.[0]?.message ?? `AniList HTTP ${res.status}`)
  cache.set(key, { at: Date.now(), data: json.data })
  return json.data
}

export interface AniLink {
  site: string
  url: string
  type?: string
  icon?: string | null
  color?: string | null
  language?: string | null
}

interface AniMedia {
  id: number
  title: { romaji?: string; english?: string | null; userPreferred?: string }
  format?: string | null
  episodes?: number | null
  duration?: number | null
  seasonYear?: number | null
  season?: string | null
  averageScore?: number | null
  popularity?: number | null
  genres?: string[]
  tags?: { name: string; rank: number; isMediaSpoiler: boolean }[]
  studios?: { nodes: { name: string }[] }
  coverImage?: { large?: string; extraLarge?: string; color?: string | null }
  bannerImage?: string | null
  description?: string | null
  externalLinks?: AniLink[]
  streamingEpisodes?: { title?: string; thumbnail?: string; url: string; site: string }[]
  recommendations?: { nodes: { mediaRecommendation: AniMedia | null }[] }
}

const CARD = `
  id title { romaji english userPreferred } format episodes duration seasonYear season averageScore popularity genres
  tags { name rank isMediaSpoiler } studios(isMain: true) { nodes { name } }
  coverImage { large extraLarge color } bannerImage description(asHtml: false)
  externalLinks { site url type icon color language }
`

const LIST = `query ($page: Int, $perPage: Int, $sort: [MediaSort], $search: String, $season: MediaSeason,
  $seasonYear: Int, $genre: String, $licensedBy: [String]) {
  Page(page: $page, perPage: $perPage) {
    media(type: ANIME, isAdult: false, sort: $sort, search: $search, season: $season, seasonYear: $seasonYear,
      genre: $genre, licensedBy_in: $licensedBy) { ${CARD} }
  }
}`

// Same query without the licence filter, for the fallback path.
const LIST_NO_LICENSE = LIST.replace(', $licensedBy: [String]', '').replace(', licensedBy_in: $licensedBy', '')

const DETAIL = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    ${CARD}
    streamingEpisodes { title thumbnail url site }
    recommendations(perPage: 16, sort: RATING_DESC) { nodes { mediaRecommendation { ${CARD} } } }
  }
}`

/** Official free YouTube releases for a title: a playlist link and/or per-episode links. */
export function youtubeOf(m: Pick<AniMedia, 'externalLinks' | 'streamingEpisodes'>) {
  const links = (m.externalLinks ?? []).filter((l) => /youtube/i.test(l.site) && l.type !== 'SOCIAL')
  const main = links.map((l) => parseYouTube(l.url)).find((r) => r)
  const episodes = (m.streamingEpisodes ?? [])
    .filter((e) => /youtube/i.test(e.site))
    .map((e) => ({ ...e, ref: parseYouTube(e.url) }))
    .filter((e) => e.ref?.videoId)
  return { main: main ?? null, episodes }
}

const hasFreeYouTube = (m: AniMedia) => {
  const yt = youtubeOf(m)
  return !!yt.main || yt.episodes.length > 0
}

function toItem(m: AniMedia): MediaItem {
  const free = hasFreeYouTube(m)
  return {
    id: `anilist:${m.id}`,
    provider: 'anilist',
    kind: m.format === 'MOVIE' ? 'movie' : 'series',
    title: m.title.english || m.title.userPreferred || m.title.romaji || 'Untitled',
    subtitle: m.title.english && m.title.romaji !== m.title.english ? m.title.romaji : undefined,
    description: plainText(m.description ?? '').slice(0, 2000),
    year: m.seasonYear ?? undefined,
    poster: m.coverImage?.extraLarge ?? m.coverImage?.large,
    backdrop: m.bannerImage ?? undefined,
    duration: m.duration ? m.duration * 60 : undefined,
    tags: [
      'anime',
      ...(m.genres ?? []),
      ...(m.tags ?? []).filter((t) => !t.isMediaSpoiler && t.rank >= 60).slice(0, 6).map((t) => t.name),
      ...(m.studios?.nodes ?? []).slice(0, 1).map((s) => `studio:${s.name}`),
      free ? 'free on youtube' : '',
    ].filter(Boolean),
    popularity: m.popularity ? Math.min(1, Math.log10(1 + m.popularity) / 6) : undefined,
  }
}

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const
export function currentSeason(d = new Date()): { season: (typeof SEASONS)[number]; year: number } {
  return { season: SEASONS[Math.floor(d.getMonth() / 3)]!, year: d.getFullYear() }
}

export const ANIME_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Romance', 'Sci-Fi', 'Slice of Life',
  'Sports', 'Mystery', 'Supernatural', 'Mecha', 'Psychological', 'Music',
] as const

async function list(vars: Record<string, unknown>): Promise<MediaItem[]> {
  const r = await gql<{ Page: { media: AniMedia[] } }>(LIST, { page: 1, perPage: 30, ...vars })
  return r.Page.media.map(toItem)
}

/**
 * Titles with an official free YouTube release. Uses AniList's licence filter
 * and falls back to filtering popular titles client-side if that filter is unavailable.
 */
async function freeOnYouTube(genre?: string): Promise<MediaItem[]> {
  const base = { sort: ['POPULARITY_DESC'], genre: genre || undefined }
  try {
    const r = await gql<{ Page: { media: AniMedia[] } }>(LIST, { page: 1, perPage: 40, ...base, licensedBy: ['YouTube'] })
    const media = r.Page.media.filter(hasFreeYouTube)
    if (media.length) return media.map(toItem)
  } catch {
    /* fall through to the client-side filter */
  }
  const pages = await Promise.all(
    [1, 2, 3].map((page) =>
      gql<{ Page: { media: AniMedia[] } }>(LIST_NO_LICENSE, { page, perPage: 50, ...base }).catch(() => ({ Page: { media: [] } })),
    ),
  )
  return pages.flatMap((p) => p.Page.media).filter(hasFreeYouTube).map(toItem)
}

export interface AnimeExtras {
  links: AniLink[]
  youtube: { videoId?: string; playlistId?: string } | null
  episodes: Episode[]
  similar: MediaItem[]
  color?: string | null
}

async function detail(id: string) {
  const r = await gql<{ Media: AniMedia | null }>(DETAIL, { id: Number(id) })
  return r.Media
}

function sourceFor(ref: { videoId?: string; playlistId?: string }): StreamSource {
  return { type: 'youtube', url: embedUrl(ref), youtube: ref, label: 'YouTube (official)' }
}

export const anilist: VideoProvider & {
  extras(id: string): Promise<AnimeExtras>
  freeOnYouTube: typeof freeOnYouTube
  trendingNow(genre?: string): Promise<MediaItem[]>
  thisSeason(genre?: string): Promise<MediaItem[]>
  topRated(genre?: string): Promise<MediaItem[]>
} = {
  id: 'anilist',
  name: 'AniList',
  browse: false,
  enabled: () => true,

  trending: () => list({ sort: ['TRENDING_DESC', 'POPULARITY_DESC'] }),
  trendingNow: (genre) => list({ sort: ['TRENDING_DESC', 'POPULARITY_DESC'], genre: genre || undefined }),
  thisSeason: (genre) => {
    const { season, year } = currentSeason()
    return list({ season, seasonYear: year, sort: ['POPULARITY_DESC'], genre: genre || undefined })
  },
  topRated: (genre) => list({ sort: ['SCORE_DESC'], genre: genre || undefined }),
  freeOnYouTube,

  search: (q) => list({ search: q, sort: ['SEARCH_MATCH'] }),

  async details(id) {
    const m = await detail(id)
    return m ? toItem(m) : null
  },

  async extras(id) {
    const m = await detail(id)
    if (!m) return { links: [], youtube: null, episodes: [], similar: [] }
    const yt = youtubeOf(m)
    return {
      links: (m.externalLinks ?? []).filter((l) => l.type === 'STREAMING'),
      youtube: yt.main ?? (yt.episodes[0]?.ref ?? null),
      episodes: yt.episodes.map<Episode>((e, i) => ({
        id: `${id}/${e.ref!.videoId}`,
        number: i + 1,
        title: e.title?.replace(/^Episode\s+\d+\s*-\s*/i, '') || `Episode ${i + 1}`,
        thumbnail: e.thumbnail || ytThumb(e.ref!.videoId!),
      })),
      similar: (m.recommendations?.nodes ?? []).map((n) => n.mediaRecommendation).filter((x): x is AniMedia => !!x).map(toItem),
      color: m.coverImage?.color,
    }
  },

  async episodes(id) {
    return (await anilist.extras(id)).episodes
  },

  async stream(nativeId) {
    const [id, videoId] = nativeId.split('/')
    if (videoId) return [sourceFor({ videoId })]
    const ex = await anilist.extras(id!)
    return ex.youtube ? [sourceFor(ex.youtube)] : []
  },
}
