import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useRoom } from '../state/room'
import { usePlayer } from '../state/player'
import type { MediaItem } from '../providers/types'

export const watchPath = (id: string, streamId?: string) =>
  `/watch/${encodeURIComponent(id)}${streamId ? `?ep=${encodeURIComponent(streamId)}` : ''}`

/** When a peer starts something new, bring everyone else to it. */
export function PartyFollower() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(
    () =>
      useRoom.subscribe((s, prev) => {
        if (!s.remote || s.remote === prev.remote) return
        const m = s.remote.event.media
        if (m.kind === 'video') {
          const target = watchPath(m.id, m.streamId)
          if (location.pathname + location.search !== target) navigate(target)
        } else {
          const p = usePlayer.getState()
          if (p.current()?.id !== m.id && m.item) p.playQueue([m.item as MediaItem], 0)
        }
      }),
    [navigate, location],
  )
  return null
}
