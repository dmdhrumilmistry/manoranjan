import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Settings {
  /** TMDB v4 read access token or v3 API key (optional — enables rich metadata & legal "where to watch"). */
  tmdbKey: string
  region: string
  jellyfinUrl: string
  jellyfinKey: string
  jellyfinUserId: string
  archiveEnabled: boolean
  audiusEnabled: boolean
  displayName: string
  theme: 'system' | 'dark' | 'light'
  /** Optional TURN server for peers behind strict NATs. */
  turnUrl: string
  turnUser: string
  turnPass: string
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void
  reset: () => void
}

const defaults: Settings = {
  tmdbKey: '',
  region: 'IN',
  jellyfinUrl: '',
  jellyfinKey: '',
  jellyfinUserId: '',
  archiveEnabled: true,
  audiusEnabled: true,
  displayName: `Guest-${Math.floor(Math.random() * 9000 + 1000)}`,
  theme: 'system',
  turnUrl: '',
  turnUser: '',
  turnPass: '',
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaults,
      set: (patch) => set(patch),
      reset: () => set({ ...defaults, displayName: defaults.displayName }),
    }),
    { name: 'mr.settings', version: 1 },
  ),
)

/** Non-hook accessor for providers. */
export const settings = () => useSettings.getState()
