/**
 * Pure playback-sync model for watch/listen parties.
 *
 * Every peer is equal (no host). Each local user action produces a
 * PlaybackEvent stamped with a Lamport clock; peers keep the event with the
 * highest (clock, peerId) — a deterministic last-writer-wins that converges
 * without a server. Positions are extrapolated by one-way latency so a
 * receiver jumps to where the sender *is now*, not where it was.
 */

export interface MediaRef {
  id: string
  title: string
  kind: 'video' | 'audio'
  /** Episode / stream id when the item has several. */
  streamId?: string
  /** Serialised MediaItem so peers can render it without a lookup. */
  item?: unknown
}

export interface PlaybackEvent {
  /** What is playing; includes enough for a peer to load it. */
  media: MediaRef
  playing: boolean
  /** Seconds into the media at the moment of sending. */
  position: number
  rate: number
  clock: number
  peerId: string
}

export function newer(a: PlaybackEvent, b: PlaybackEvent | null): boolean {
  if (!b) return true
  if (a.clock !== b.clock) return a.clock > b.clock
  return a.peerId > b.peerId
}

/** Lamport update: local clock must exceed every clock we've observed. */
export const tick = (local: number, observed = 0) => Math.max(local, observed) + 1

/**
 * Where playback should be right now given an event received `sinceReceiveMs`
 * ago from a peer whose one-way latency is `latencyMs`.
 */
export function expectedPosition(e: PlaybackEvent, sinceReceiveMs: number, latencyMs: number): number {
  if (!e.playing) return e.position
  return e.position + ((sinceReceiveMs + latencyMs) / 1000) * e.rate
}

export type Correction =
  | { action: 'none' }
  | { action: 'seek'; to: number }
  /** Small drift is nudged with playbackRate instead of a jarring seek. */
  | { action: 'rate'; rate: number }

export function correction(local: number, expected: number, baseRate = 1): Correction {
  const drift = expected - local
  const abs = Math.abs(drift)
  if (abs < 0.25) return { action: 'none' }
  if (abs > 2) return { action: 'seek', to: Math.max(0, expected) }
  return { action: 'rate', rate: baseRate * (drift > 0 ? 1.05 : 0.95) }
}
