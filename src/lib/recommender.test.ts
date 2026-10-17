import { describe, expect, it } from 'vitest'
import { recommend, type Interaction } from './recommender'
import type { MediaItem } from '../providers/types'

const mk = (id: string, tags: string[], extra: Partial<MediaItem> = {}): MediaItem => ({
  id: `archive:${id}`,
  provider: 'archive',
  kind: 'movie',
  title: id,
  tags,
  ...extra,
})

const noir1 = mk('noir1', ['film noir', 'crime'])
const noir2 = mk('noir2', ['film noir', 'mystery'])
const scifi = mk('scifi', ['science fiction', 'space'])
const comedy = mk('comedy', ['comedy', 'slapstick'])
const now = Date.UTC(2026, 0, 30)

describe('recommend', () => {
  it('ranks items sharing tags with liked history first', () => {
    const history: Interaction[] = [{ item: noir1, signal: 'like', at: now }]
    const recs = recommend(history, [scifi, comedy, noir2], 3, now)
    expect(recs[0]!.item.id).toBe(noir2.id)
    expect(recs[0]!.reasons).toContain('film noir')
  })

  it('excludes completed and disliked items', () => {
    const history: Interaction[] = [
      { item: noir1, signal: 'complete', at: now },
      { item: comedy, signal: 'dislike', at: now },
    ]
    const ids = recommend(history, [noir1, comedy, scifi, noir2], 10, now).map((r) => r.item.id)
    expect(ids).not.toContain(noir1.id)
    expect(ids).not.toContain(comedy.id)
  })

  it('pushes items like disliked ones down', () => {
    const slap2 = mk('slap2', ['comedy', 'slapstick'])
    const history: Interaction[] = [{ item: comedy, signal: 'dislike', at: now }]
    const recs = recommend(history, [slap2, scifi], 2, now)
    expect(recs[0]!.item.id).toBe(scifi.id)
  })

  it('decays old interactions', () => {
    const history: Interaction[] = [
      { item: noir1, signal: 'like', at: now - 365 * 86_400_000 },
      { item: scifi, signal: 'progress', at: now },
    ]
    const space2 = mk('space2', ['science fiction'])
    const recs = recommend(history, [noir2, space2], 2, now)
    expect(recs[0]!.item.id).toBe(space2.id)
  })

  it('falls back to popularity with no history', () => {
    const recs = recommend([], [mk('a', ['x'], { popularity: 0.1 }), mk('b', ['y'], { popularity: 0.9 })], 2, now)
    expect(recs[0]!.item.id).toBe('archive:b')
  })
})
