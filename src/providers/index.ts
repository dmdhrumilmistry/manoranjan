import { archive } from './archive'
import { jellyfin } from './jellyfin'
import { tmdb } from './tmdb'
import { splitId, type MediaItem, type VideoProvider } from './types'

export const videoProviders: VideoProvider[] = [jellyfin, archive, tmdb]

export const providerFor = (id: string): VideoProvider | undefined => {
  const [pid] = splitId(id)
  return videoProviders.find((p) => p.id === pid)
}

/** Query every enabled provider in parallel; one failing source never blanks the page. */
export async function fanOut(fn: (p: VideoProvider) => Promise<MediaItem[]>): Promise<{
  items: MediaItem[]
  errors: { provider: string; message: string }[]
}> {
  const enabled = videoProviders.filter((p) => p.enabled())
  const results = await Promise.allSettled(enabled.map(fn))
  const items: MediaItem[] = []
  const errors: { provider: string; message: string }[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value)
    else errors.push({ provider: enabled[i]!.name, message: String(r.reason?.message ?? r.reason) })
  })
  return { items, errors }
}

export { archive, jellyfin, tmdb }
export * from './types'
