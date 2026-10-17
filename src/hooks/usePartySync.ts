import { useEffect, useRef } from 'react'
import { correction, expectedPosition, type MediaRef } from '../lib/sync'
import { useRoom } from '../state/room'

/**
 * Keeps an <audio>/<video> element in lock-step with the party room.
 * Local user actions (play / pause / seek) are broadcast; remote events for
 * the same media are applied with latency compensation, and drift is
 * corrected every 2s with gentle playbackRate nudges before resorting to a seek.
 *
 * Returns `announce()` so callers can broadcast explicit changes (speed, new media).
 */
export function usePartySync(el: HTMLMediaElement | null, media: MediaRef | null, baseRate = 1) {
  const inRoom = useRoom((s) => s.status === 'joined')
  const suppressUntil = useRef(0)
  const mediaRef = useRef(media)
  mediaRef.current = media
  const sameMedia = (m: MediaRef) =>
    !!mediaRef.current && m.id === mediaRef.current.id && (m.streamId ?? '') === (mediaRef.current.streamId ?? '')

  const announce = useRef(() => {})
  announce.current = () => {
    if (!el || !mediaRef.current || !useRoom.getState().roomId) return
    useRoom.getState().broadcast({ media: mediaRef.current, playing: !el.paused, position: el.currentTime, rate: baseRate })
  }

  // Outbound: user-driven element events.
  useEffect(() => {
    if (!el || !inRoom) return
    const onUser = () => {
      if (performance.now() < suppressUntil.current) return
      announce.current()
    }
    el.addEventListener('play', onUser)
    el.addEventListener('pause', onUser)
    el.addEventListener('seeked', onUser)
    return () => {
      el.removeEventListener('play', onUser)
      el.removeEventListener('pause', onUser)
      el.removeEventListener('seeked', onUser)
    }
  }, [el, inRoom])

  // Inbound: apply remote state, then keep correcting drift.
  useEffect(() => {
    if (!el || !inRoom) return
    const apply = (hardSeekOnly: boolean) => {
      const { remote, peers, last } = useRoom.getState()
      if (!remote || !sameMedia(remote.event.media)) return
      // Our own latest action wins until someone acts after it.
      if (last && last !== remote.event) return
      const e = remote.event
      const latency = peers[e.peerId]?.latencyMs ?? 50
      const target = expectedPosition(e, performance.now() - remote.receivedAt, latency)
      suppressUntil.current = performance.now() + 600

      if (e.playing && el.paused) void el.play().catch(() => {})
      if (!e.playing && !el.paused) el.pause()

      const c = correction(el.currentTime, target, e.rate)
      if (c.action === 'seek' || (hardSeekOnly && c.action === 'rate')) el.currentTime = target
      else if (c.action === 'rate' && e.playing) el.playbackRate = c.rate
      else el.playbackRate = e.rate
    }
    const unsub = useRoom.subscribe((s, prev) => {
      if (s.remote !== prev.remote) apply(true)
    })
    apply(true)
    const t = setInterval(() => apply(false), 2000)
    return () => {
      unsub()
      clearInterval(t)
    }
  }, [el, inRoom])

  // Announce whenever the media itself changes while in a room.
  useEffect(() => {
    if (!inRoom || !media) return
    const { remote } = useRoom.getState()
    // Don't echo a change that came from a peer.
    if (remote && sameMedia(remote.event.media)) return
    const t = setTimeout(() => announce.current(), 300)
    return () => clearTimeout(t)
    // Keyed on identity, not object reference: re-renders with the same media must not re-announce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRoom, media?.id, media?.streamId])

  return () => announce.current()
}
