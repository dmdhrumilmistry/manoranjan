import { getJSON } from '../lib/http'
import { settings } from '../state/settings'
import type { Episode, MediaItem, StreamSource, VideoProvider } from './types'
import { popularityFrom } from './util'

/**
 * Jellyfin — your own self-hosted media server (movies, series, anime you own).
 * Auth via API key in the query string, which avoids a CORS preflight.
 * Set "Known proxies"/CORS on the server if it is on another origin.
 */
interface JfItem {
  Id: string
  Name: string
  Type: 'Movie' | 'Series' | 'Episode' | string
  Overview?: string
  ProductionYear?: number
  Genres?: string[]
  Tags?: string[]
  Studios?: { Name: string }[]
  RunTimeTicks?: number
  CommunityRating?: number
  IndexNumber?: number
  ParentIndexNumber?: number
  SeriesName?: string
  ImageTags?: Record<string, string>
  BackdropImageTags?: string[]
}

const base = () => settings().jellyfinUrl.trim().replace(/\/+$/, '')
const key = () => settings().jellyfinKey.trim()

function url(path: string, params: Record<string, string> = {}) {
  const p = new URLSearchParams({ ...params, api_key: key() })
  const uid = settings().jellyfinUserId.trim()
  if (uid && !p.has('userId')) p.set('userId', uid)
  return `${base()}${path}?${p}`
}

const img = (id: string, type: 'Primary' | 'Backdrop', w: number) =>
  `${base()}/Items/${id}/Images/${type}?maxWidth=${w}&quality=85`

function toItem(i: JfItem): MediaItem {
  return {
    id: `jellyfin:${i.Id}`,
    provider: 'jellyfin',
    kind: i.Type === 'Series' ? 'series' : i.Type === 'Episode' ? 'episode' : 'movie',
    title: i.Name,
    subtitle: i.SeriesName,
    description: i.Overview,
    year: i.ProductionYear,
    poster: i.ImageTags?.Primary ? img(i.Id, 'Primary', 400) : undefined,
    backdrop: i.BackdropImageTags?.length ? img(i.Id, 'Backdrop', 1280) : undefined,
    tags: [...(i.Genres ?? []), ...(i.Tags ?? []), ...(i.Studios ?? []).map((s) => s.Name)].slice(0, 15),
    duration: i.RunTimeTicks ? i.RunTimeTicks / 1e7 : undefined,
    popularity: i.CommunityRating ? i.CommunityRating / 10 : popularityFrom(undefined),
  }
}

const FIELDS = 'Overview,Genres,Tags,Studios,ProductionYear,RunTimeTicks'

export const jellyfin: VideoProvider = {
  id: 'jellyfin',
  name: 'My Jellyfin',
  enabled: () => !!(base() && key()),

  async trending(kind) {
    const r = await getJSON<{ Items: JfItem[] }>(
      url('/Items', {
        Recursive: 'true',
        IncludeItemTypes: kind === 'series' ? 'Series' : 'Movie',
        SortBy: 'DateCreated',
        SortOrder: 'Descending',
        Limit: '40',
        Fields: FIELDS,
      }),
    )
    return r.Items.map(toItem)
  },

  async search(q) {
    const r = await getJSON<{ Items: JfItem[] }>(
      url('/Items', { Recursive: 'true', searchTerm: q, IncludeItemTypes: 'Movie,Series', Limit: '30', Fields: FIELDS }),
    )
    return r.Items.map(toItem)
  },

  async details(id) {
    const r = await getJSON<{ Items: JfItem[] }>(url('/Items', { ids: id, Fields: FIELDS }))
    const i = r.Items[0]
    return i ? toItem(i) : null
  },

  async episodes(id) {
    const r = await getJSON<{ Items: JfItem[] }>(url(`/Shows/${id}/Episodes`, { Fields: 'Overview' }))
    return r.Items.map<Episode>((e) => ({
      id: e.Id,
      title: e.Name,
      season: e.ParentIndexNumber,
      number: e.IndexNumber,
      thumbnail: e.ImageTags?.Primary ? img(e.Id, 'Primary', 320) : undefined,
    }))
  },

  async stream(id) {
    // Direct play first (no server CPU), HLS transcode as a fallback for codecs the browser can't decode.
    return [
      { url: url(`/Videos/${id}/stream`, { static: 'true', MediaSourceId: id }), type: 'file', label: 'Direct' },
      {
        url: url(`/Videos/${id}/master.m3u8`, {
          MediaSourceId: id,
          VideoCodec: 'h264',
          AudioCodec: 'aac',
          TranscodingMaxAudioChannels: '2',
          SegmentContainer: 'ts',
        }),
        type: 'hls',
        label: 'Transcode',
      },
    ] satisfies StreamSource[]
  },
}
