import { getJSON } from '../lib/http'
import { settings } from '../state/settings'
import type { Episode, MediaItem, StreamSource, VideoProvider } from './types'
import { asArray, plainText, popularityFrom, yearOf } from './util'
import { guessLang, isSubtitleFile } from '../lib/subtitles'

/**
 * Internet Archive - public-domain & openly licensed films and classic TV.
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

const baseName = (name: string) => name.replace(/(\.\w+)+$/, '').replace(/_(512kb|edit|h264|hd)$/i, '')

/**
 * Archive encodings → quality menu entries. Ordered by browser compatibility:
 * IA's h.264 derivatives play everywhere, while "original" MPEG4 uploads are
 * often MPEG-4 Part 2, which Chrome can't decode, so they go last.
 */
function quality(f: MetaFile): { label: string; height?: number; rank: number } {
  const fmt = f.format ?? ''
  if (/HD/i.test(fmt)) return { label: 'HD 720p', height: 720, rank: 0 }
  if (/h\.264/i.test(fmt)) return { label: f.source === 'original' ? 'Original (h.264)' : 'Standard 480p', height: 480, rank: 1 }
  if (/512Kb/i.test(fmt)) return { label: 'Data saver 360p', height: 360, rank: 2 }
  if (/webm/i.test(fmt) || /\.webm$/i.test(f.name)) return { label: 'WebM', rank: 3 }
  if (/ogg/i.test(fmt) || /\.ogv$/i.test(f.name)) return { label: 'Ogg 360p', height: 360, rank: 4 }
  return { label: f.source === 'original' ? 'Original' : fmt || 'Video', rank: 5 }
}

/** One entry per distinct video (episodes / parts), using its most compatible encoding. */
function uniqueVideos(files: MetaFile[]): MetaFile[] {
  const seen = new Map<string, MetaFile>()
  for (const f of files.filter(isVideo).sort((a, b) => quality(a).rank - quality(b).rank)) {
    const base = baseName(f.name)
    if (!seen.has(base)) seen.set(base, f)
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

const mimeOf = (name: string) => (/\.webm$/i.test(name) ? 'video/webm' : /\.ogv$/i.test(name) ? 'video/ogg' : 'video/mp4')

/** All encodings of one video as quality options, plus any matching subtitle files. */
function renditions(ident: string, files: MetaFile[], base: string): StreamSource[] {
  const subs = files
    .filter((f) => isSubtitleFile(f.name))
    .map((f) => ({ src: download(ident, f.name), ...guessLang(f.name) }))
    // Prefer subtitles named after this video; fall back to all of the item's subtitles.
    .sort((a, b) => Number(b.src.includes(encodeURIComponent(base))) - Number(a.src.includes(encodeURIComponent(base))))
  return files
    .filter((f) => isVideo(f) && baseName(f.name) === base)
    .map((f) => ({ f, q: quality(f) }))
    .sort((a, b) => a.q.rank - b.q.rank)
    .map<StreamSource>(({ f, q }) => ({
      url: download(ident, f.name),
      type: 'file',
      mime: mimeOf(f.name),
      label: q.label,
      height: q.height,
      subtitles: subs,
    }))
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
    // Episode ids look like "<identifier>/<file name>"; plain ids play the item's main video.
    const slash = nativeId.indexOf('/')
    const ident = slash > 0 ? nativeId.slice(0, slash) : nativeId
    const r = await getJSON<{ files?: MetaFile[] }>(`${BASE}/metadata/${encodeURIComponent(ident)}`)
    const files = r.files ?? []
    const main = slash > 0 ? nativeId.slice(slash + 1) : uniqueVideos(files)[0]?.name
    return main ? renditions(ident, files, baseName(main)) : []
  },
}
