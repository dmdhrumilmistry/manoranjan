import { getJSON } from '../lib/http'
import { settings } from '../state/settings'
import type { Episode, MediaItem, StreamSource, VideoProvider } from './types'
import { asArray, plainText, popularityFrom, yearOf } from './util'

/**
 * Internet Archive — public-domain & openly licensed films and classic TV.
 * Public, CORS-enabled APIs, no key required.
 */
const BASE = 'https://archive.org'
const COLLECTIONS = {
  movie: ['feature_films', 'silent_films', 'sci-fi_horror', 'film_noir', 'comedy_films'],
  series: ['classic_tv', 'television_inbox', 'classic_cartoons'],
} as const
const inCollections = (c: readonly string[]) => `collection:(${c.join(' OR ')})`

interface SearchDoc {
  identifier: string
  title?: string
  year?: string
  date?: string
  subject?: string | string[]
  description?: string | string[]
  downloads?: number
  collection?: string | string[]
}

interface MetaFile {
  name: string
  format?: string
  length?: string
  size?: string
  source?: string
}

const thumb = (id: string) => `${BASE}/services/img/${encodeURIComponent(id)}`
const isVideo = (f: MetaFile) => /\.(mp4|m4v|webm|ogv)$/i.test(f.name)

function kindOf(doc: SearchDoc): 'movie' | 'series' {
  const c = asArray(doc.collection).join(' ')
  return /classic_tv|television|cartoon/.test(c) ? 'series' : 'movie'
}

function toItem(doc: SearchDoc, kind?: 'movie' | 'series'): MediaItem {
  return {
    id: `archive:${doc.identifier}`,
    provider: 'archive',
    kind: kind ?? kindOf(doc),
    title: plainText(doc.title) || doc.identifier,
    year: yearOf(doc.year ?? doc.date),
    description: plainText(doc.description).slice(0, 600),
    poster: thumb(doc.identifier),
    tags: asArray(doc.subject)
      .flatMap((s) => s.split(/[;,]/))
      .map((s) => s.trim())
      .filter((s) => s && s.length < 40)
      .slice(0, 12),
    popularity: popularityFrom(doc.downloads),
  }
}

async function query(q: string, rows = 40, sort = 'downloads desc'): Promise<SearchDoc[]> {
  const p = new URLSearchParams({ q, rows: String(rows), page: '1', output: 'json' })
  for (const f of ['identifier', 'title', 'year', 'date', 'subject', 'description', 'downloads', 'collection'])
    p.append('fl[]', f)
  p.append('sort[]', sort)
  const r = await getJSON<{ response: { docs: SearchDoc[] } }>(`${BASE}/advancedsearch.php?${p}`)
  return r.response.docs
}

/** Rank playable files: prefer h.264 originals, then larger derivatives. */
function rankFiles(files: MetaFile[]): MetaFile[] {
  const score = (f: MetaFile) =>
    (/h\.264/i.test(f.format ?? '') ? 4 : 0) + (f.source === 'original' ? 2 : 0) + (/\.mp4$/i.test(f.name) ? 1 : 0)
  return files.filter(isVideo).sort((a, b) => score(b) - score(a) || Number(b.size ?? 0) - Number(a.size ?? 0))
}

/** Group multiple encodings of one video by their base name. */
function uniqueVideos(files: MetaFile[]): MetaFile[] {
  const seen = new Map<string, MetaFile>()
  for (const f of rankFiles(files)) {
    const base = f.name.replace(/(\.\w+)+$/, '').replace(/_(512kb|edit|h264)$/i, '')
    if (!seen.has(base)) seen.set(base, f)
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

const download = (id: string, name: string) =>
  `${BASE}/download/${encodeURIComponent(id)}/${name.split('/').map(encodeURIComponent).join('/')}`

export const archive: VideoProvider = {
  id: 'archive',
  name: 'Internet Archive',
  enabled: () => settings().archiveEnabled,

  async trending(kind) {
    const docs = await query(`${inCollections(COLLECTIONS[kind])} AND mediatype:(movies)`, 40, 'week desc')
    return docs.map((d) => toItem(d, kind))
  },

  async search(q) {
    const safe = q.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').trim()
    if (!safe) return []
    const all = [...COLLECTIONS.movie, ...COLLECTIONS.series]
    const docs = await query(`(title:(${safe}) OR subject:(${safe})) AND mediatype:(movies) AND ${inCollections(all)}`, 30)
    return docs.map((d) => toItem(d))
  },

  async details(id) {
    const r = await getJSON<{ metadata?: SearchDoc & { runtime?: string }; files?: MetaFile[] }>(
      `${BASE}/metadata/${encodeURIComponent(id)}`,
    )
    if (!r.metadata) return null
    const item = toItem({ ...r.metadata, identifier: id })
    item.description = plainText(r.metadata.description).slice(0, 2000)
    item.backdrop = item.poster
    const vids = uniqueVideos(r.files ?? [])
    if (vids.length > 1) item.kind = 'series'
    const len = Number(vids[0]?.length)
    if (Number.isFinite(len) && len > 0) item.duration = len
    return item
  },

  async episodes(id) {
    const r = await getJSON<{ files?: MetaFile[] }>(`${BASE}/metadata/${encodeURIComponent(id)}`)
    return uniqueVideos(r.files ?? []).map<Episode>((f, i) => ({
      id: `${id}/${f.name}`,
      number: i + 1,
      title: f.name.replace(/\.\w+$/, '').replace(/[_-]+/g, ' '),
    }))
  },

  async stream(nativeId) {
    const slash = nativeId.indexOf('/')
    if (slash > 0) {
      // Episode id: "<identifier>/<file name>"
      const ident = nativeId.slice(0, slash)
      return [{ url: download(ident, nativeId.slice(slash + 1)), type: 'file', mime: 'video/mp4' }]
    }
    const r = await getJSON<{ files?: MetaFile[] }>(`${BASE}/metadata/${encodeURIComponent(nativeId)}`)
    const files = r.files ?? []
    const best = rankFiles(files)
    const vtt = files.filter((f) => /\.vtt$/i.test(f.name))
    return best.slice(0, 3).map<StreamSource>((f) => ({
      url: download(nativeId, f.name),
      type: 'file',
      mime: /\.webm$/i.test(f.name) ? 'video/webm' : /\.ogv$/i.test(f.name) ? 'video/ogg' : 'video/mp4',
      label: f.format,
      subtitles: vtt.map((v) => ({ src: download(nativeId, v.name), lang: 'en', label: v.name.replace(/\.vtt$/i, '') })),
    }))
  },
}
