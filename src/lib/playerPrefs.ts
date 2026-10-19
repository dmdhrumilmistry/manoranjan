import { readJSON, writeJSON } from './storage'

/** Per-device player preferences, remembered across titles. */
export interface PlayerPrefs {
  volume: number
  muted: boolean
  rate: number
  subsOn: boolean
  subLang: string | null
  subScale: number
  fill: boolean
  /** Preferred quality label, e.g. "720p"; matched loosely against each title's options. */
  quality: string | null
}

const KEY = 'mr.player.prefs'
const defaults: PlayerPrefs = {
  volume: 1,
  muted: false,
  rate: 1,
  subsOn: false,
  subLang: null,
  subScale: 1,
  fill: false,
  quality: null,
}

export const loadPrefs = (): PlayerPrefs => ({ ...defaults, ...readJSON<Partial<PlayerPrefs>>(KEY, {}) })
export const savePrefs = (p: PlayerPrefs) => writeJSON(KEY, p)

/** Pick the source matching a remembered quality ("720p" matches "HD 720p"), else the first. */
export function preferredIndex(labels: (string | undefined)[], wanted: string | null): number {
  if (!wanted) return 0
  const height = wanted.match(/\d{3,4}p/)?.[0]
  const i = labels.findIndex((l) => l === wanted || (!!height && !!l?.includes(height)))
  return i >= 0 ? i : 0
}
