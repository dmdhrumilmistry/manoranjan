import { useCallback, useEffect, useRef, useState } from 'react'
import type Hls from 'hls.js'
import type { StreamSource } from '../providers/types'
import type { MediaRef } from '../lib/sync'
import { formatTime } from '../lib/format'
import { usePartySync } from '../hooks/usePartySync'
import { Icon } from './Icon'

interface Props {
  sources: StreamSource[]
  poster?: string
  title: string
  startAt?: number
  party: MediaRef | null
  onProgress?: (position: number, duration: number) => void
  onEnded?: () => void
  /** Exposes the element so the page can capture it for live casting. */
  onElement?: (el: HTMLVideoElement | null) => void
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function VideoPlayer({ sources, poster, title, startAt = 0, party, onProgress, onEnded, onElement }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [el, setEl] = useState<HTMLVideoElement | null>(null)
  const [srcIndex, setSrcIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(true)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [subsOn, setSubsOn] = useState(false)
  const [idle, setIdle] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [menu, setMenu] = useState(false)
  const announce = usePartySync(el, party, rate)
  const source = sources[srcIndex]

  const bindEl = useCallback(
    (v: HTMLVideoElement | null) => {
      setEl(v)
      onElement?.(v)
    },
    [onElement],
  )

  useEffect(() => setSrcIndex(0), [sources])

  // Attach the source (hls.js only where native HLS is missing), falling back through sources on error.
  useEffect(() => {
    if (!el || !source) return
    setError(null)
    let hls: Hls | null = null
    let cancelled = false
    const fail = () => {
      if (cancelled) return
      if (srcIndex < sources.length - 1) setSrcIndex(srcIndex + 1)
      else setError('This video could not be played. The source may be offline or use an unsupported format.')
    }
    const resume = () => {
      if (startAt > 5 && el.duration && startAt < el.duration - 10) el.currentTime = startAt
    }
    el.addEventListener('loadedmetadata', resume, { once: true })
    el.addEventListener('error', fail)

    if (source.type === 'hls' && !el.canPlayType('application/vnd.apple.mpegurl')) {
      void import('hls.js').then(({ default: HlsCtor }) => {
        if (cancelled) return
        if (!HlsCtor.isSupported()) return fail()
        hls = new HlsCtor({ enableWorker: true, lowLatencyMode: false })
        hls.on(HlsCtor.Events.ERROR, (_, d) => d.fatal && fail())
        hls.loadSource(source.url)
        hls.attachMedia(el)
      })
    } else {
      el.src = source.url
    }
    return () => {
      cancelled = true
      el.removeEventListener('error', fail)
      el.removeEventListener('loadedmetadata', resume)
      hls?.destroy()
      el.removeAttribute('src')
      el.load()
    }
    // startAt intentionally only applies on first load of a source
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, source, srcIndex, sources.length])

  // Mirror element state into React.
  useEffect(() => {
    if (!el) return
    let lastSaved = 0
    const on: Record<string, () => void> = {
      play: () => setPaused(false),
      pause: () => setPaused(true),
      waiting: () => setWaiting(true),
      playing: () => setWaiting(false),
      canplay: () => setWaiting(false),
      durationchange: () => setDuration(el.duration || 0),
      volumechange: () => {
        setVolume(el.volume)
        setMuted(el.muted)
      },
      ratechange: () => setRate((r) => (Math.abs(el.playbackRate - r) > 0.06 ? el.playbackRate : r)),
      progress: () => {
        const b = el.buffered
        setBuffered(b.length ? b.end(b.length - 1) : 0)
      },
      timeupdate: () => {
        setTime(el.currentTime)
        if (Math.abs(el.currentTime - lastSaved) > 5) {
          lastSaved = el.currentTime
          onProgress?.(el.currentTime, el.duration || 0)
        }
      },
      ended: () => {
        onProgress?.(el.duration, el.duration)
        onEnded?.()
      },
    }
    for (const [k, f] of Object.entries(on)) el.addEventListener(k, f)
    return () => {
      for (const [k, f] of Object.entries(on)) el.removeEventListener(k, f)
    }
  }, [el, onProgress, onEnded])

  useEffect(() => {
    if (!el) return
    for (const t of Array.from(el.textTracks)) t.mode = subsOn ? 'showing' : 'hidden'
  }, [el, subsOn, source])

  // Auto-hide controls while playing.
  useEffect(() => {
    if (paused) return setIdle(false)
    let t = setTimeout(() => setIdle(true), 2500)
    const wake = () => {
      setIdle(false)
      clearTimeout(t)
      t = setTimeout(() => setIdle(true), 2500)
    }
    const w = wrap.current
    w?.addEventListener('pointermove', wake)
    w?.addEventListener('keydown', wake)
    return () => {
      clearTimeout(t)
      w?.removeEventListener('pointermove', wake)
      w?.removeEventListener('keydown', wake)
    }
  }, [paused])

  const toggle = useCallback(() => {
    if (!el) return
    if (el.paused) void el.play().catch(() => {})
    else el.pause()
  }, [el])

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void wrap.current?.requestFullscreen?.().catch(() => {})
  }, [])

  const seekBy = useCallback(
    (d: number) => {
      if (el) el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + d))
    },
    [el],
  )

  const onKey = (e: React.KeyboardEvent) => {
    if (!el || (e.target as HTMLElement).tagName === 'INPUT') return
    const k = e.key.toLowerCase()
    const handled = true
    if (k === ' ' || k === 'k') toggle()
    else if (k === 'f') fullscreen()
    else if (k === 'm') el.muted = !el.muted
    else if (k === 'c') setSubsOn((s) => !s)
    else if (k === 'arrowright' || k === 'l') seekBy(k === 'l' ? 10 : 5)
    else if (k === 'arrowleft' || k === 'j') seekBy(k === 'j' ? -10 : -5)
    else if (k === 'arrowup') el.volume = Math.min(1, el.volume + 0.1)
    else if (k === 'arrowdown') el.volume = Math.max(0, el.volume - 0.1)
    else if (/^[0-9]$/.test(k) && el.duration) el.currentTime = (Number(k) / 10) * el.duration
    else return
    if (handled) e.preventDefault()
  }

  const setSpeed = (r: number) => {
    if (!el) return
    el.playbackRate = r
    setRate(r)
    setMenu(false)
    setTimeout(announce, 0)
  }

  const pct = (x: number) => (duration ? `${(x / duration) * 100}%` : '0%')

  return (
    <div
      ref={wrap}
      className={`vp ${idle ? 'vp--idle' : ''}`}
      tabIndex={0}
      onKeyDown={onKey}
      role="region"
      aria-label={`Video player: ${title}`}
    >
      <video
        ref={bindEl}
        className="vp__video"
        poster={poster}
        playsInline
        preload="metadata"
        crossOrigin={source?.subtitles?.length ? 'anonymous' : undefined}
        onClick={toggle}
        onDoubleClick={fullscreen}
      >
        {source?.subtitles?.map((s) => <track key={s.src} kind="subtitles" src={s.src} srcLang={s.lang} label={s.label} />)}
      </video>

      {waiting && !error && <div className="vp__spinner" aria-label="Buffering" />}
      {error && (
        <div className="vp__error" role="alert">
          <Icon name="alert" /> {error}
        </div>
      )}
      {paused && !error && (
        <button className="vp__bigplay" onClick={toggle} aria-label="Play">
          <Icon name="play" size={40} />
        </button>
      )}

      <div className="vp__controls" onClick={(e) => e.stopPropagation()}>
        <div className="vp__bar">
          <div className="vp__buffered" style={{ width: pct(buffered) }} />
          <div className="vp__played" style={{ width: pct(time) }} />
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={duration || 0}
            step={0.1}
            value={time}
            onChange={(e) => el && (el.currentTime = Number(e.target.value))}
          />
        </div>
        <div className="vp__row">
          <button onClick={toggle} aria-label={paused ? 'Play' : 'Pause'} title="Play/Pause (k)">
            <Icon name={paused ? 'play' : 'pause'} />
          </button>
          <button onClick={() => seekBy(-10)} aria-label="Back 10 seconds" title="Back 10s (j)">
            <Icon name="rewind" />
          </button>
          <button onClick={() => seekBy(10)} aria-label="Forward 10 seconds" title="Forward 10s (l)">
            <Icon name="forward" />
          </button>
          <button onClick={() => el && (el.muted = !el.muted)} aria-label={muted ? 'Unmute' : 'Mute'} title="Mute (m)">
            <Icon name={muted || volume === 0 ? 'mute' : 'volume'} />
          </button>
          <input
            className="vp__vol"
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              if (!el) return
              el.volume = Number(e.target.value)
              el.muted = el.volume === 0
            }}
          />
          <span className="vp__time">
            {formatTime(time)} / {formatTime(duration)}
          </span>
          <span className="vp__spacer" />
          {!!source?.subtitles?.length && (
            <button onClick={() => setSubsOn((s) => !s)} aria-pressed={subsOn} aria-label="Subtitles" title="Subtitles (c)">
              <Icon name="cc" />
            </button>
          )}
          <div className="vp__menuwrap">
            <button onClick={() => setMenu((m) => !m)} aria-label="Playback speed" aria-expanded={menu}>
              {rate}×
            </button>
            {menu && (
              <div className="vp__menu" role="menu">
                {SPEEDS.map((s) => (
                  <button key={s} role="menuitemradio" aria-checked={s === rate} onClick={() => setSpeed(s)}>
                    {s}×
                  </button>
                ))}
                {sources.length > 1 && <div className="vp__menu-sep">Source</div>}
                {sources.length > 1 &&
                  sources.map((s, i) => (
                    <button key={s.url} role="menuitemradio" aria-checked={i === srcIndex} onClick={() => setSrcIndex(i)}>
                      {s.label ?? `Source ${i + 1}`}
                    </button>
                  ))}
              </div>
            )}
          </div>
          {'pictureInPictureEnabled' in document && (
            <button
              onClick={() =>
                document.pictureInPictureElement ? void document.exitPictureInPicture() : void el?.requestPictureInPicture()
              }
              aria-label="Picture in picture"
            >
              <Icon name="pip" />
            </button>
          )}
          <button onClick={fullscreen} aria-label="Fullscreen" title="Fullscreen (f)">
            <Icon name="fullscreen" />
          </button>
        </div>
      </div>
    </div>
  )
}
