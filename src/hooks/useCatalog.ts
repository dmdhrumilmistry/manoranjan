import { useEffect, useMemo } from 'react'
import { fanOut, type MediaItem } from '../providers'
import { audius } from '../providers/audius'
import { recommend } from '../lib/recommender'
import { useLibrary } from '../state/library'
import { useSettings } from '../state/settings'
import { useAsync } from './useAsync'

/** Everything fetched is added to the local candidate pool that powers recommendations. */
function useFeed(loader: () => Promise<MediaItem[]>, deps: unknown[]) {
  const addToPool = useLibrary((s) => s.addToPool)
  const state = useAsync(loader, deps)
  useEffect(() => {
    if (state.data?.length) addToPool(state.data)
  }, [state.data, addToPool])
  return state
}

/** Re-fetch when sources are reconfigured. */
const useSourceKey = () =>
  useSettings((s) => [s.archiveEnabled, s.audiusEnabled, s.tmdbKey, s.jellyfinUrl, s.jellyfinKey].join('|'))

export function useTrending(kind: 'movie' | 'series') {
  const key = useSourceKey()
  const s = useFeed(async () => {
    const { items, errors } = await fanOut((p) => p.trending(kind))
    if (!items.length && errors.length) throw new Error(errors.map((e) => `${e.provider}: ${e.message}`).join('; '))
    return items
  }, [kind, key])
  return s
}

export function useTrendingMusic(genre?: string) {
  const key = useSourceKey()
  return useFeed(() => audius.trending(genre), [genre, key])
}

export function useRecommendations(kind?: MediaItem['kind'] | 'video', limit = 20) {
  const history = useLibrary((s) => s.history)
  const pool = useLibrary((s) => s.pool)
  return useMemo(() => {
    const candidates = pool.filter((i) =>
      !kind ? true : kind === 'video' ? i.kind !== 'track' : i.kind === kind,
    )
    const relevant = history.filter((h) => (kind === 'track' ? h.item.kind === 'track' : h.item.kind !== 'track'))
    if (!relevant.length) return { items: [], reasons: {} as Record<string, string> }
    const recs = recommend(relevant, candidates, limit)
    const reasons: Record<string, string> = {}
    for (const r of recs) if (r.reasons[0]) reasons[r.item.id] = `Because you like ${r.reasons[0]}`
    return { items: recs.map((r) => r.item), reasons }
  }, [history, pool, kind, limit])
}
