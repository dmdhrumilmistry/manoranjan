import { useEffect, useRef, useState } from 'react'
import type { MediaRef } from '../lib/sync'
import { YouTubeBridge, embedUrl } from '../lib/youtube'
import { usePartySync } from '../hooks/usePartySync'
import { Icon } from './Icon'

interface Props {
  videoId?: string
  playlistId?: string
  title: string
  startAt?: number
  party: MediaRef | null
  onProgress?: (position: number, duration: number) => void
  onEnded?: () => void
}

/**
 * Official free releases on YouTube, in the privacy-enhanced embed. The bridge
 * makes the iframe look like a media element, so watch parties stay in sync
 * and progress is saved just like the built-in player.
 */
export function YouTubePlayer({ videoId, playlistId, title, startAt = 0, party, onProgress, onEnded }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [bridge, setBridge] = useState<YouTubeBridge | null>(null)
  const src = embedUrl({ videoId, playlistId }) + (startAt > 5 ? `&start=${Math.floor(startAt)}` : '')

  useEffect(() => {
    if (!frame.current) return
    const b = new YouTubeBridge(frame.current)
    setBridge(b)
    return () => b.destroy()
  }, [src])

  useEffect(() => {
    if (!bridge) return
    let lastSaved = 0
    const tick = () => {
      if (Math.abs(bridge.currentTime - lastSaved) > 5) {
        lastSaved = bridge.currentTime
        onProgress?.(bridge.currentTime, bridge.duration)
      }
    }
    const ended = () => {
      onProgress?.(bridge.duration, bridge.duration)
      onEnded?.()
    }
    bridge.addEventListener('timeupdate', tick)
    bridge.addEventListener('ended', ended)
    return () => {
      bridge.removeEventListener('timeupdate', tick)
      bridge.removeEventListener('ended', ended)
    }
  }, [bridge, onProgress, onEnded])

  usePartySync(bridge as unknown as HTMLMediaElement | null, party)

  return (
    <div className="yt">
      <iframe
        ref={frame}
        key={src}
        src={src}
        title={title}
        className="yt__frame"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        // YouTube refuses to play embeds without a referrer; send only our origin (the page default is no-referrer).
        referrerPolicy="strict-origin-when-cross-origin"
        // No allow-popups: links inside the embed can't open new windows or ad tabs.
        sandbox="allow-scripts allow-same-origin allow-presentation"
      />
      <p className="yt__note">
        <Icon name="shield" size={14} /> Official free release, played in YouTube’s privacy-enhanced mode. YouTube may show its own ads.
      </p>
    </div>
  )
}
