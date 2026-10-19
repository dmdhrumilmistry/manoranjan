import type { MediaItem } from '../providers/types'
import { normalizeTag } from './format'

/**
 * On-device, content-based recommender. Nothing leaves the browser.
 *
 * 1. Each interaction contributes its item's tags to a taste profile, weighted
 *    by signal strength (finished > started, like > neutral, dislike < 0)
 *    and decayed exponentially with age.
 * 2. Tags are IDF-weighted against the candidate pool so ubiquitous tags
 *    ("movie", "feature film") don't dominate.
 * 3. Candidates are ranked by cosine similarity to the profile, blended with
 *    a small popularity prior; already-finished or disliked items are dropped
 *    and a per-tag diversity penalty keeps the list from collapsing to one genre.
 */

export type Signal = 'view' | 'progress' | 'complete' | 'like' | 'dislike'

export interface Interaction {
  item: MediaItem
  signal: Signal
  at: number
}

const SIGNAL_WEIGHT: Record<Signal, number> = {
  view: 0.5,
  progress: 1,
  complete: 2,
  like: 3,
  dislike: -3,
}

const HALF_LIFE_DAYS = 21
const DAY_MS = 86_400_000

type Vec = Map<string, number>

function itemFeatures(item: MediaItem): string[] {
  const f = item.tags.map(normalizeTag).filter(Boolean)
  f.push(`kind:${item.kind}`)
  if (item.year) f.push(`decade:${Math.floor(item.year / 10) * 10}`)
  return [...new Set(f)]
}

export function idf(pool: MediaItem[]): Vec {
  const df: Vec = new Map()
  for (const it of pool) for (const f of itemFeatures(it)) df.set(f, (df.get(f) ?? 0) + 1)
  const n = Math.max(pool.length, 1)
  const out: Vec = new Map()
  for (const [f, d] of df) out.set(f, Math.log(1 + n / d))
  return out
}

function vectorize(item: MediaItem, weights: Vec): Vec {
  const v: Vec = new Map()
  for (const f of itemFeatures(item)) v.set(f, weights.get(f) ?? 1)
  return v
}

export function buildProfile(history: Interaction[], weights: Vec, now = Date.now()): Vec {
  const profile: Vec = new Map()
  for (const h of history) {
    const ageDays = Math.max(0, now - h.at) / DAY_MS
    const w = SIGNAL_WEIGHT[h.signal] * Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
    for (const [f, x] of vectorize(h.item, weights)) profile.set(f, (profile.get(f) ?? 0) + w * x)
  }
  return profile
}

function cosine(a: Vec, b: Vec): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (const [k, x] of a) {
    na += x * x
    const y = b.get(k)
    if (y !== undefined) dot += x * y
  }
  for (const y of b.values()) nb += y * y
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export interface Scored {
  item: MediaItem
  score: number
  /** Top tags that drove the match - shown to the user as "Because you like …". */
  reasons: string[]
}

export function recommend(history: Interaction[], candidates: MediaItem[], limit = 20, now = Date.now()): Scored[] {
  const weights = idf([...candidates, ...history.map((h) => h.item)])
  const profile = buildProfile(history, weights, now)

  const excluded = new Set(
    history.filter((h) => h.signal === 'complete' || h.signal === 'dislike').map((h) => h.item.id),
  )
  const seen = new Set<string>()
  const scored: Scored[] = []
  for (const item of candidates) {
    if (excluded.has(item.id) || seen.has(item.id)) continue
    seen.add(item.id)
    const v = vectorize(item, weights)
    const sim = profile.size ? cosine(profile, v) : 0
    const score = 0.85 * sim + 0.15 * (item.popularity ?? 0.3)
    const reasons = [...v.keys()]
      .filter((k) => !k.includes(':') && (profile.get(k) ?? 0) > 0)
      .sort((a, b) => (profile.get(b) ?? 0) - (profile.get(a) ?? 0))
      .slice(0, 2)
    scored.push({ item, score, reasons })
  }
  scored.sort((a, b) => b.score - a.score)

  // Greedy re-rank: penalise items whose primary tag is already over-represented.
  const out: Scored[] = []
  const tagCount = new Map<string, number>()
  const pool = [...scored]
  while (out.length < limit && pool.length) {
    let best = 0
    let bestVal = -Infinity
    for (let i = 0; i < Math.min(pool.length, 50); i++) {
      const s = pool[i]!
      const primary = s.reasons[0] ?? ''
      const val = s.score - 0.05 * (tagCount.get(primary) ?? 0)
      if (val > bestVal) {
        bestVal = val
        best = i
      }
    }
    const [pick] = pool.splice(best, 1)
    out.push(pick!)
    const p = pick!.reasons[0]
    if (p) tagCount.set(p, (tagCount.get(p) ?? 0) + 1)
  }
  return out
}
