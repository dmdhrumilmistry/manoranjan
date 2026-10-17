import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MediaItem } from '../providers/types'
import type { Interaction, Signal } from '../lib/recommender'

const MAX_HISTORY = 500
const MAX_POOL = 800

export interface Progress {
  position: number
  duration: number
  at: number
  /** For series: which episode/stream id was playing. */
  streamId?: string
}

interface LibraryStore {
  history: Interaction[]
  watchlist: MediaItem[]
  progress: Record<string, Progress>
  /** Items seen while browsing — the on-device candidate pool for recommendations. */
  pool: MediaItem[]
  record: (item: MediaItem, signal: Signal) => void
  toggleWatchlist: (item: MediaItem) => void
  setProgress: (item: MediaItem, p: Omit<Progress, 'at'>) => void
  addToPool: (items: MediaItem[]) => void
  rating: (id: string) => 'like' | 'dislike' | null
  clear: () => void
}

export const useLibrary = create<LibraryStore>()(
  persist(
    (set, get) => ({
      history: [],
      watchlist: [],
      progress: {},
      pool: [],
      record: (item, signal) =>
        set((s) => {
          let history = s.history
          // A new rating replaces the previous rating of the same item.
          if (signal === 'like' || signal === 'dislike')
            history = history.filter((h) => !(h.item.id === item.id && (h.signal === 'like' || h.signal === 'dislike')))
          return { history: [...history, { item, signal, at: Date.now() }].slice(-MAX_HISTORY) }
        }),
      toggleWatchlist: (item) =>
        set((s) => ({
          watchlist: s.watchlist.some((w) => w.id === item.id)
            ? s.watchlist.filter((w) => w.id !== item.id)
            : [item, ...s.watchlist],
        })),
      setProgress: (item, p) => set((s) => ({ progress: { ...s.progress, [item.id]: { ...p, at: Date.now() } } })),
      addToPool: (items) =>
        set((s) => {
          const map = new Map(s.pool.map((i) => [i.id, i]))
          for (const i of items) map.set(i.id, i)
          return { pool: [...map.values()].slice(-MAX_POOL) }
        }),
      rating: (id) => {
        for (let i = get().history.length - 1; i >= 0; i--) {
          const h = get().history[i]!
          if (h.item.id === id && (h.signal === 'like' || h.signal === 'dislike')) return h.signal
        }
        return null
      },
      clear: () => set({ history: [], watchlist: [], progress: {}, pool: [] }),
    }),
    { name: 'mr.library', version: 1 },
  ),
)

/** Items with meaningful unfinished progress, most recent first. */
export function continueWatching(progress: Record<string, Progress>, history: Interaction[]): MediaItem[] {
  const byId = new Map(history.map((h) => [h.item.id, h.item]))
  return Object.entries(progress)
    .filter(([, p]) => p.duration > 0 && p.position > 30 && p.position / p.duration < 0.92)
    .sort((a, b) => b[1].at - a[1].at)
    .map(([id]) => byId.get(id))
    .filter((x): x is MediaItem => !!x)
    .slice(0, 20)
}
