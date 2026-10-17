import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlayer } from '../state/player'
import { useLibrary } from '../state/library'
import { trackStreamUrl } from '../providers/audius'
import { usePartySync } from '../hooks/usePartySync'
import { formatTime } from '../lib/format'
import type { MediaRef } from '../lib/sync'
import { Icon } from './Icon'

/** Persistent bottom player; survives navigation. Supports Media Session (lock-screen / hardware keys). */
export function MusicBar() {
  const p = usePlayer()
  const record = useLibrary((s) => s.record)
  const [el, setEl] = useState<HTMLAudioElement | null>(null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showQueue, setShowQueue] = useState(false)
  const track = p.queue[p.index] ?? null
  const counted = useRef<string | null>(null)

  const party = useMemo<MediaRef | null>(
    () => (track ? { id: track.id, title: track.title, kind: 'audio', item: track } : null),
    [track],
  )
  usePartySync(el, party)

  // Load source on track change.
  useEffect(() => {
    if (!el || !track) return
    let live = true
    const src = track.id.startsWith('local:') ? Promise.resolve(track.id.slice(6)) : trackStreamUrl(track)
    void src.then((url) => {
      if (!live) return
      el.src = url
      if (usePlayer.getState().playing) void el.play().catch(() => usePlayer.getState().setPlaying(false))
    })
    record(track, 'view')
    counted.current = null
    return () => {
      live = false
    }
  }, [el, track, record])

  const { playing, setPlaying } = p
  useEffect(() => {
    if (!el || !el.src) return
    if (playing && el.paused) void el.play().catch(() => setPlaying(false))
    if (!playing && !el.paused) el.pause()
  }, [el, playing, setPlaying])

  useEffect(() => {
    if (el) el.volume = p.volume
  }, [el, p.volume])

  useEffect(() => {
    if (el && p.seekTo) {
      el.currentTime = p.seekTo.t
      void el.play().catch(() => {})
    }
  }, [el, p.seekTo])

  useEffect(() => {
    if (!track || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.subtitle ?? '',
      artwork: track.poster ? [{ src: track.poster, sizes: '480x480' }] : [],
    })
    const s = usePlayer.getState()
    navigator.mediaSession.setActionHandler('play', () => s.setPlaying(true))
    navigator.mediaSession.setActionHandler('pause', () => s.setPlaying(false))
    navigator.mediaSession.setActionHandler('nexttrack', () => s.next())
    navigator.mediaSession.setActionHandler('previoustrack', () => s.prev())
  }, [track])

  if (!track) return <audio ref={setEl} hidden />

  return (
    <div className="musicbar" role="region" aria-label="Music player">
      <audio
        ref={setEl}
        preload="auto"
        onPlay={() => p.setPlaying(true)}
        onPause={() => p.setPlaying(false)}
        onTimeUpdate={(e) => {
          const a = e.currentTarget
          setTime(a.currentTime)
          if (counted.current !== track.id && a.duration && a.currentTime > a.duration * 0.6) {
            counted.current = track.id
            record(track, 'complete')
          }
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={() => p.next(true)}
        onError={() => p.next(true)}
      />
      <div className="musicbar__track">
        {track.poster ? <img src={track.poster} alt="" referrerPolicy="no-referrer" /> : <div className="musicbar__noart" />}
        <div className="musicbar__text">
          <div className="musicbar__title">{track.title}</div>
          <div className="musicbar__artist">{track.subtitle}</div>
        </div>
        <button className="icon-btn" onClick={() => record(track, 'like')} aria-label="Like track" title="Like">
          <Icon name="heart" size={18} />
        </button>
      </div>
      <div className="musicbar__center">
        <div className="musicbar__buttons">
          <button className="icon-btn" aria-pressed={p.shuffle} onClick={p.toggleShuffle} aria-label="Shuffle">
            <Icon name="shuffle" size={18} />
          </button>
          <button className="icon-btn" onClick={p.prev} aria-label="Previous">
            <Icon name="prev" />
          </button>
          <button className="icon-btn icon-btn--primary" onClick={() => p.setPlaying(!p.playing)} aria-label={p.playing ? 'Pause' : 'Play'}>
            <Icon name={p.playing ? 'pause' : 'play'} />
          </button>
          <button className="icon-btn" onClick={() => p.next()} aria-label="Next">
            <Icon name="next" />
          </button>
          <button className="icon-btn" aria-pressed={p.repeat !== 'off'} onClick={p.cycleRepeat} aria-label={`Repeat: ${p.repeat}`}>
            <Icon name="repeat" size={18} />
            {p.repeat === 'one' && <span className="badge-dot">1</span>}
          </button>
        </div>
        <div className="musicbar__seek">
          <span>{formatTime(time)}</span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={duration || 0}
            step={0.5}
            value={time}
            onChange={(e) => el && (el.currentTime = Number(e.target.value))}
          />
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <div className="musicbar__right">
        <Icon name="volume" size={18} />
        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.05}
          value={p.volume}
          onChange={(e) => p.setVolume(Number(e.target.value))}
        />
        <button className="icon-btn" aria-expanded={showQueue} onClick={() => setShowQueue((s) => !s)} aria-label="Queue">
          <Icon name="queue" size={18} />
        </button>
      </div>
      {showQueue && (
        <div className="queue" role="dialog" aria-label="Up next">
          <header>
            <h3>Up next</h3>
            <button className="icon-btn" onClick={() => setShowQueue(false)} aria-label="Close queue">
              <Icon name="close" size={18} />
            </button>
          </header>
          <ol>
            {p.queue.map((q, i) => (
              <li key={`${q.id}-${i}`} className={i === p.index ? 'is-current' : ''}>
                <button onClick={() => p.jump(i)}>
                  <span className="queue__title">{q.title}</span>
                  <span className="queue__artist">{q.subtitle}</span>
                </button>
                <button className="icon-btn" onClick={() => p.removeAt(i)} aria-label={`Remove ${q.title}`}>
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
