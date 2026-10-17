import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MediaItem } from '../providers/types'

/** Global audio queue. The <audio> element itself lives in <MusicBar>. */
interface PlayerStore {
  queue: MediaItem[]
  index: number
  playing: boolean
  volume: number
  shuffle: boolean
  repeat: 'off' | 'all' | 'one'
  /** Bumped to ask the bar to seek (party sync, scrubbing from elsewhere). */
  seekTo: { t: number; n: number } | null
  current: () => MediaItem | null
  playQueue: (items: MediaItem[], start?: number) => void
  enqueue: (item: MediaItem) => void
  playNext: (item: MediaItem) => void
  removeAt: (i: number) => void
  setPlaying: (p: boolean) => void
  next: (auto?: boolean) => void
  prev: () => void
  jump: (i: number) => void
  seek: (t: number) => void
  setVolume: (v: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
}

export const usePlayer = create<PlayerStore>()(
  persist(
    (set, get) => ({
      queue: [],
      index: 0,
      playing: false,
      volume: 0.9,
      shuffle: false,
      repeat: 'off',
      seekTo: null,
      current: () => get().queue[get().index] ?? null,
      playQueue: (items, start = 0) => set({ queue: items, index: start, playing: true }),
      enqueue: (item) => set((s) => ({ queue: [...s.queue, item] })),
      playNext: (item) =>
        set((s) => {
          const q = [...s.queue]
          q.splice(s.index + 1, 0, item)
          return { queue: q }
        }),
      removeAt: (i) =>
        set((s) => {
          const q = s.queue.filter((_, j) => j !== i)
          return { queue: q, index: i < s.index ? s.index - 1 : Math.min(s.index, Math.max(0, q.length - 1)) }
        }),
      setPlaying: (playing) => set({ playing }),
      next: (auto = false) =>
        set((s) => {
          if (!s.queue.length) return {}
          if (auto && s.repeat === 'one') return { seekTo: { t: 0, n: (s.seekTo?.n ?? 0) + 1 }, playing: true }
          if (s.shuffle && s.queue.length > 1) {
            let i = s.index
            while (i === s.index) i = Math.floor(Math.random() * s.queue.length)
            return { index: i, playing: true }
          }
          const atEnd = s.index >= s.queue.length - 1
          if (atEnd && auto && s.repeat === 'off') return { playing: false }
          return { index: atEnd ? 0 : s.index + 1, playing: true }
        }),
      prev: () => set((s) => ({ index: Math.max(0, s.index - 1), playing: true })),
      jump: (i) => set({ index: i, playing: true }),
      seek: (t) => set((s) => ({ seekTo: { t, n: (s.seekTo?.n ?? 0) + 1 } })),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
      cycleRepeat: () => set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
    }),
    {
      name: 'mr.player',
      version: 1,
      partialize: (s) => ({ queue: s.queue, index: s.index, volume: s.volume, shuffle: s.shuffle, repeat: s.repeat }),
    },
  ),
)
