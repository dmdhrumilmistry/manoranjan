import { describe, expect, it } from 'vitest'
import { correction, expectedPosition, newer, tick, type PlaybackEvent } from './sync'

const ev = (p: Partial<PlaybackEvent>): PlaybackEvent => ({
  media: { id: 'archive:x', title: 'x', kind: 'video' },
  playing: true,
  position: 10,
  rate: 1,
  clock: 1,
  peerId: 'a',
  ...p,
})

describe('sync', () => {
  it('orders by clock then peerId', () => {
    expect(newer(ev({ clock: 2 }), ev({ clock: 1 }))).toBe(true)
    expect(newer(ev({ clock: 1 }), ev({ clock: 2 }))).toBe(false)
    expect(newer(ev({ clock: 2, peerId: 'b' }), ev({ clock: 2, peerId: 'a' }))).toBe(true)
    expect(newer(ev({}), null)).toBe(true)
  })

  it('tick exceeds both clocks', () => {
    expect(tick(3, 7)).toBe(8)
    expect(tick(9, 2)).toBe(10)
  })

  it('extrapolates position only while playing', () => {
    expect(expectedPosition(ev({}), 1000, 200)).toBeCloseTo(11.2)
    expect(expectedPosition(ev({ rate: 2 }), 1000, 0)).toBeCloseTo(12)
    expect(expectedPosition(ev({ playing: false }), 5000, 200)).toBe(10)
  })

  it('chooses none / rate / seek by drift size', () => {
    expect(correction(10, 10.1)).toEqual({ action: 'none' })
    expect(correction(10, 11)).toEqual({ action: 'rate', rate: 1.05 })
    expect(correction(10, 9)).toEqual({ action: 'rate', rate: 0.95 })
    expect(correction(10, 30)).toEqual({ action: 'seek', to: 30 })
  })
})
