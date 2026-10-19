import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type Hls from 'hls.js'
import type { StreamSource } from '../providers/types'
import type { MediaRef } from '../lib/sync'
import { formatTime } from '../lib/format'
import { fetchAsVttBlob, guessLang, vttBlobUrl } from '../lib/subtitles'
import { loadPrefs, preferredIndex, savePrefs, type PlayerPrefs } from '../lib/playerPrefs'
import { usePartySync } from '../hooks/usePartySync'
import { toast } from '../state/toast'
import { Icon, type IconName } from './Icon'

interface Props {
  sources: StreamSource[]
  poster?: string
  title: string
  /** Second line in the top overlay, e.g. the episode name. */
  subtitle?: string
  startAt?: number
  party: MediaRef | null
  onProgress?: (position: number, duration: number) => void
  onEnded?: () => void
  /** Exposes the element so the page can capture it for live casting. */
  onElement?: (el: HTMLVideoElement | null) => void
  /** Shows an "Up next" card near the end and auto-plays it after a countdown. */
  next?: { label: string; play: () => void }
}

interface Track {
  key: string
  src: string
  lang: string
  label: string
}

type MenuPage = 'main' | 'quality' | 'subtitles' | 'speed' | 'audio'

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const SUB_SCALES = [
  { v: 0.75, label: 'Small' },
  { v: 1, label: 'Normal' },
  { v: 1.35, label: 'Large' },
  { v: 1.75, label: 'Huge' },
]
const SEEK_STEP = 10
const NEXT_COUNTDOWN = 8

const SHORTCUTS: [string, string][] = [
  ['Space / K', 'Play or pause'],
  ['J / L', 'Back / forward 10 seconds'],
  ['← / →', 'Back / forward 5 seconds'],
  ['↑ / ↓', 'Volume up / down'],
  ['M', 'Mute'],
  ['C', 'Subtitles on / off'],
  ['F', 'Fullscreen'],
  ['< / >', 'Slower / faster'],
  ['0 – 9', 'Jump to 0% – 90%'],
  ['Double-click sides', 'Back / forward 10 seconds'],
  ['?', 'Show this help'],
]

function MenuRow({ icon, label, value, onOpen }: { icon: IconName; label: string; value: string; onOpen: () => void }) {
  return (
    <button className="vp__menu-row" role="menuitem" onClick={onOpen}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
      <span className="vp__menu-value">{value}</span>
      <Icon name="chevronRight" size={18} />
    </button>
  )
}

function MenuHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button className="vp__menu-back" onClick={onBack}>
      <Icon name="chevronLeft" size={18} /> {label}
    </button>
  )
}

function Option({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="vp__menu-option" role="menuitemradio" aria-checked={checked} onClick={onClick}>
      <span className="vp__check">{checked && <Icon name="check" size={16} />}</span>
      {children}
    </button>
  )
}

/** Original cue timings, so a subtitle delay can be changed repeatedly without drift. */
const cueOrigin = new WeakMap<TextTrackCue, [number, number]>()

export function VideoPlayer({ sources, poster, title, subtitle, startAt = 0, party, onProgress, onEnded, onElement, next }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const resumeRef = useRef<{ t: number; play: boolean } | null>(null)
  const [prefs, setPrefsState] = useState<PlayerPrefs>(loadPrefs)
  const [el, setEl] = useState<HTMLVideoElement | null>(null)
  const [srcIndex, setSrcIndex] = useState(() => preferredIndex(sources.map((s) => s.label), prefs.quality))
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(true)
  const [started, setStarted] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const [idle, setIdle] = useState(false)
  const [menu, setMenu] = useState<MenuPage | null>(null)
  const [help, setHelp] = useState(false)
  const [showRemaining, setShowRemaining] = useState(false)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const [ripple, setRipple] = useState<{ side: 'left' | 'right'; amount: number; key: number } | null>(null)
  const [flash, setFlash] = useState<{ icon: IconName; key: number } | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [activeSub, setActiveSub] = useState<string | null>(null)
  const [subDelay, setSubDelay] = useState(0)
  const [hlsLevels, setHlsLevels] = useState<{ height: number; bitrate: number }[]>([])
  const [hlsLevel, setHlsLevel] = useState(-1)
  const [audioTracks, setAudioTracks] = useState<string[]>([])
  const [audioTrack, setAudioTrack] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const announce = usePartySync(el, party, prefs.rate)
  const source = sources[srcIndex]
  const blobCache = useRef(new Map<string, string>())

  const setPrefs = useCallback((patch: Partial<PlayerPrefs>) => {
    setPrefsState((p) => {
      const nextPrefs = { ...p, ...patch }
      savePrefs(nextPrefs)
      return nextPrefs
    })
  }, [])

  const bindEl = useCallback(
    (v: HTMLVideoElement | null) => {
      setEl(v)
      onElement?.(v)
    },
    [onElement],
  )

  // New title → pick the remembered quality again.
  useEffect(() => {
    setSrcIndex(preferredIndex(sources.map((s) => s.label), loadPrefs().quality))
    setTracks([])
    setActiveSub(null)
    setCountdown(null)
  }, [sources])

  // ---------- Source loading (hls.js only where native HLS is missing) ----------
  useEffect(() => {
    if (!el || !source) return
    setError(null)
    setHlsLevels([])
    setHlsLevel(-1)
    setAudioTracks([])
    let hls: Hls | null = null
    let cancelled = false

    const fail = () => {
      if (cancelled) return
      const nextIdx = srcIndex + 1
      if (nextIdx < sources.length) {
        resumeRef.current = { t: el.currentTime || resumeRef.current?.t || 0, play: true }
        toast(`“${source.label ?? 'This version'}” wouldn’t play here, trying ${sources[nextIdx]!.label ?? 'another version'}`)
        setSrcIndex(nextIdx)
      } else {
        setError('This video can’t be played right now. The source may be offline or in a format your browser doesn’t support.')
      }
    }
    const onMeta = () => {
      const resume = resumeRef.current
      resumeRef.current = null
      if (resume) {
        el.currentTime = resume.t
        if (resume.play) void el.play().catch(() => {})
      } else if (startAt > 5 && el.duration && startAt < el.duration - 10) {
        el.currentTime = startAt
      }
      el.playbackRate = prefs.rate
    }
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('error', fail)

    if (source.type === 'hls' && !el.canPlayType('application/vnd.apple.mpegurl')) {
      void import('hls.js').then(({ default: HlsCtor }) => {
        if (cancelled) return
        if (!HlsCtor.isSupported()) return fail()
        hls = new HlsCtor({ enableWorker: true, capLevelToPlayerSize: true })
        hlsRef.current = hls
        hls.on(HlsCtor.Events.ERROR, (_, d) => d.fatal && fail())
        hls.on(HlsCtor.Events.MANIFEST_PARSED, (_, d) => setHlsLevels(d.levels.map((l) => ({ height: l.height, bitrate: l.bitrate }))))
        hls.on(HlsCtor.Events.AUDIO_TRACKS_UPDATED, (_, d) => setAudioTracks(d.audioTracks.map((t) => t.name || t.lang || 'Track')))
        hls.loadSource(source.url)
        hls.attachMedia(el)
      })
    } else {
      el.src = source.url
    }
    return () => {
      cancelled = true
      el.removeEventListener('error', fail)
      el.removeEventListener('loadedmetadata', onMeta)
      hls?.destroy()
      hlsRef.current = null
      el.removeAttribute('src')
      el.load()
    }
    // startAt/prefs.rate only matter at load time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, source, srcIndex, sources.length])

  // ---------- Subtitles: fetch → VTT blob, cached across quality switches ----------
  const subSources = source?.subtitles
  useEffect(() => {
    if (!subSources?.length) return
    let live = true
    void Promise.all(
      subSources.map(async (s) => {
        let blob = blobCache.current.get(s.src)
        if (!blob) {
          blob = await fetchAsVttBlob(s.src).catch(() => undefined)
          if (blob) blobCache.current.set(s.src, blob)
        }
        return blob ? { key: s.src, src: blob, lang: s.lang, label: s.label } : null
      }),
    ).then((list) => {
      if (!live) return
      const loaded = list.filter((t): t is Track => !!t)
      setTracks((cur) => [...loaded, ...cur.filter((c) => c.key.startsWith('user:'))])
    })
    return () => {
      live = false
    }
  }, [subSources])

  // Auto-enable remembered subtitle language.
  useEffect(() => {
    if (activeSub || !prefs.subsOn || !tracks.length) return
    const t = tracks.find((x) => x.lang === prefs.subLang) ?? tracks[0]!
    setActiveSub(t.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks])

  useEffect(() => () => blobCache.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const applyDelay = useCallback(() => {
    if (!el) return
    for (const tt of Array.from(el.textTracks)) {
      for (const cue of Array.from(tt.cues ?? [])) {
        let o = cueOrigin.get(cue)
        if (!o) cueOrigin.set(cue, (o = [cue.startTime, cue.endTime]))
        cue.startTime = Math.max(0, o[0] + subDelay)
        cue.endTime = Math.max(0, o[1] + subDelay)
      }
    }
  }, [el, subDelay])

  const applyTrackModes = useCallback(() => {
    if (!el) return
    for (const tt of Array.from(el.textTracks)) tt.mode = tt.id === activeSub ? 'showing' : 'hidden'
    applyDelay()
  }, [el, activeSub, applyDelay])

  useEffect(() => {
    applyTrackModes()
    if (!el) return
    el.textTracks.addEventListener('addtrack', applyTrackModes)
    return () => el.textTracks.removeEventListener('addtrack', applyTrackModes)
  }, [el, applyTrackModes, tracks])

  const chooseSub = (key: string | null) => {
    setActiveSub(key)
    const t = tracks.find((x) => x.key === key)
    setPrefs({ subsOn: !!key, subLang: t?.lang ?? prefs.subLang })
  }

  const loadSubFile = async (file: File | undefined) => {
    if (!file) return
    const { lang, label } = guessLang(file.name)
    const t: Track = { key: `user:${file.name}:${file.size}`, src: vttBlobUrl(await file.text()), lang, label }
    blobCache.current.set(t.key, t.src)
    setTracks((cur) => [...cur.filter((c) => c.key !== t.key), t])
    setActiveSub(t.key)
    setMenu(null)
    toast(`Subtitles loaded: ${label}`, 'success')
  }

  // ---------- Element → React state ----------
  useEffect(() => {
    if (!el) return
    let lastSaved = 0
    el.volume = prefs.volume
    el.muted = prefs.muted
    const on: Record<string, () => void> = {
      play: () => {
        setPaused(false)
        setStarted(true)
      },
      pause: () => setPaused(true),
      waiting: () => setWaiting(true),
      playing: () => setWaiting(false),
      canplay: () => setWaiting(false),
      durationchange: () => setDuration(el.duration || 0),
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
        if (next) setCountdown(NEXT_COUNTDOWN)
      },
    }
    for (const [k, f] of Object.entries(on)) el.addEventListener(k, f)
    return () => {
      for (const [k, f] of Object.entries(on)) el.removeEventListener(k, f)
    }
    // prefs only seed the element once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, onProgress, onEnded, next])

  // Up-next countdown.
  useEffect(() => {
    if (countdown === null || !next) return
    if (countdown <= 0) {
      setCountdown(null)
      next.play()
      return
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
  }, [countdown, next])

  // Auto-hide controls while playing and the pointer is still.
  useEffect(() => {
    if (paused || menu || help) return setIdle(false)
    let t = setTimeout(() => setIdle(true), 2800)
    const wake = () => {
      setIdle(false)
      clearTimeout(t)
      t = setTimeout(() => setIdle(true), 2800)
    }
    const w = wrap.current
    w?.addEventListener('pointermove', wake)
    w?.addEventListener('keydown', wake)
    return () => {
      clearTimeout(t)
      w?.removeEventListener('pointermove', wake)
      w?.removeEventListener('keydown', wake)
    }
  }, [paused, menu, help])

  // ---------- Actions ----------
  const showFlash = (icon: IconName) => setFlash({ icon, key: Date.now() })

  const toggle = useCallback(() => {
    if (!el) return
    if (el.paused) {
      void el.play().catch(() => {})
      showFlash('play')
    } else {
      el.pause()
      showFlash('pause')
    }
  }, [el])

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void wrap.current?.requestFullscreen?.().catch(() => {})
  }, [])

  const seekBy = useCallback(
    (d: number, withRipple = false) => {
      if (!el) return
      el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + d))
      if (withRipple) {
        const side = d < 0 ? 'left' : 'right'
        setRipple((r) => ({ side, amount: r && r.side === side ? r.amount + Math.abs(d) : Math.abs(d), key: Date.now() }))
      }
    },
    [el],
  )

  useEffect(() => {
    if (!ripple) return
    const t = setTimeout(() => setRipple(null), 700)
    return () => clearTimeout(t)
  }, [ripple])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 500)
    return () => clearTimeout(t)
  }, [flash])

  const setVolume = (v: number) => {
    if (!el) return
    el.volume = Math.min(1, Math.max(0, v))
    el.muted = el.volume === 0
    setPrefs({ volume: el.volume, muted: el.muted })
  }
  const toggleMute = () => {
    if (!el) return
    el.muted = !el.muted
    if (!el.muted && el.volume === 0) el.volume = 0.5
    setPrefs({ muted: el.muted, volume: el.volume })
  }

  const setSpeed = (r: number) => {
    if (!el) return
    el.playbackRate = r
    setPrefs({ rate: r })
    setTimeout(announce, 0)
  }

  const chooseSource = (i: number) => {
    if (!el || i === srcIndex) return setMenu(null)
    resumeRef.current = { t: el.currentTime, play: !el.paused }
    setSrcIndex(i)
    setPrefs({ quality: sources[i]?.label ?? null })
    setMenu(null)
    toast(`Switched to ${sources[i]?.label ?? 'another version'}`)
  }

  const chooseLevel = (i: number) => {
    if (hlsRef.current) hlsRef.current.currentLevel = i
    setHlsLevel(i)
    setMenu(null)
  }

  const chooseAudio = (i: number) => {
    if (hlsRef.current) hlsRef.current.audioTrack = i
    setAudioTrack(i)
    setMenu(null)
  }

  // ---------- Pointer gestures ----------
  // Mouse: click = play/pause (instant), double-click sides = ±10s, double-click centre = fullscreen.
  // The two clicks of a double-click toggle play twice, which cancels out.
  // Touch: tap = show/hide controls, double-tap sides = ±10s (keep tapping to add more).
  const pointerType = useRef('mouse')
  const lastTap = useRef<{ t: number; zone: 'left' | 'center' | 'right' } | null>(null)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const zoneOf = (clientX: number): 'left' | 'center' | 'right' => {
    const r = wrap.current!.getBoundingClientRect()
    const x = (clientX - r.left) / r.width
    return x < 0.35 ? 'left' : x > 0.65 ? 'right' : 'center'
  }

  const onSurfaceClick = (e: React.MouseEvent) => {
    if (menu) return setMenu(null)
    if (pointerType.current !== 'touch') return toggle()
    const zone = zoneOf(e.clientX)
    const now = performance.now()
    const prev = lastTap.current
    clearTimeout(tapTimer.current)
    if (prev && now - prev.t < 320 && zone !== 'center' && prev.zone === zone) {
      seekBy(zone === 'left' ? -SEEK_STEP : SEEK_STEP, true)
      lastTap.current = { t: now, zone }
      return
    }
    lastTap.current = { t: now, zone }
    tapTimer.current = setTimeout(() => setIdle((v) => !v), 260)
  }

  const onSurfaceDoubleClick = (e: React.MouseEvent) => {
    if (pointerType.current === 'touch') return
    const zone = zoneOf(e.clientX)
    if (zone === 'center') fullscreen()
    else seekBy(zone === 'left' ? -SEEK_STEP : SEEK_STEP, true)
  }

  // ---------- Keyboard ----------
  const onKey = (e: React.KeyboardEvent) => {
    if (!el || (e.target as HTMLElement).tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key
    const lower = k.toLowerCase()
    if (k === ' ' || lower === 'k') toggle()
    else if (lower === 'f') fullscreen()
    else if (lower === 'm') toggleMute()
    else if (lower === 'c') chooseSub(activeSub ? null : (tracks.find((t) => t.lang === prefs.subLang) ?? tracks[0])?.key ?? null)
    else if (lower === 'l') seekBy(SEEK_STEP, true)
    else if (lower === 'j') seekBy(-SEEK_STEP, true)
    else if (k === 'ArrowRight') seekBy(5, true)
    else if (k === 'ArrowLeft') seekBy(-5, true)
    else if (k === 'ArrowUp') setVolume(el.volume + 0.1)
    else if (k === 'ArrowDown') setVolume(el.volume - 0.1)
    else if (k === '>' || k === '<') {
      const i = SPEEDS.indexOf(prefs.rate)
      const r = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 3 : i) + (k === '>' ? 1 : -1)))]!
      setSpeed(r)
      toast(`Speed ${r}×`)
    } else if (k === '?') setHelp((h) => !h)
    else if (k === 'Escape') {
      setMenu(null)
      setHelp(false)
    } else if (/^[0-9]$/.test(k) && el.duration) el.currentTime = (Number(k) / 10) * el.duration
    else return
    e.preventDefault()
  }

  useEffect(() => {
    wrap.current?.focus({ preventScroll: true })
  }, [])

  // ---------- Derived labels ----------
  const pct = (x: number) => (duration ? `${Math.min(100, (x / duration) * 100)}%` : '0%')
  const qualityLabel =
    source?.type === 'hls' && hlsLevels.length > 1
      ? hlsLevel === -1
        ? 'Auto'
        : `${hlsLevels[hlsLevel]?.height}p`
      : (source?.label ?? 'Auto')
  const isHD = (source?.height ?? 0) >= 720 || (hlsLevel >= 0 && (hlsLevels[hlsLevel]?.height ?? 0) >= 720)
  const subLabel = tracks.find((t) => t.key === activeSub)?.label ?? 'Off'
  const remaining = duration - time
  const showNextCard = !!next && (countdown !== null || (duration > 60 && remaining < 25 && remaining > 0))
  const qualityOptions = useMemo(() => sources.map((s, i) => ({ i, label: s.label ?? `Version ${i + 1}` })), [sources])

  return (
    <div
      ref={wrap}
      className={`vp ${idle && !paused ? 'vp--idle' : ''} ${prefs.fill ? 'vp--fill' : ''}`}
      style={{ '--cue-scale': prefs.subScale } as React.CSSProperties}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerDown={(e) => (pointerType.current = e.pointerType)}
      role="region"
      aria-label={`Video player: ${title}`}
    >
      <video ref={bindEl} className="vp__video" poster={poster} playsInline preload="metadata">
        {tracks.map((t) => (
          <track key={t.key} id={t.key} kind="subtitles" src={t.src} srcLang={t.lang} label={t.label} onLoad={applyDelay} />
        ))}
      </video>

      {/* Gesture surface sits above the video, below the controls. */}
      <div className="vp__surface" onClick={onSurfaceClick} onDoubleClick={onSurfaceDoubleClick} aria-hidden />

      {ripple && (
        <div key={ripple.key} className={`vp__ripple vp__ripple--${ripple.side}`} aria-hidden>
          <Icon name={ripple.side === 'left' ? 'replay' : 'skipForward'} size={28} />
          <span>{ripple.side === 'left' ? '−' : '+'}{ripple.amount}s</span>
        </div>
      )}
      {flash && (
        <div key={flash.key} className="vp__flash" aria-hidden>
          <Icon name={flash.icon} size={36} />
        </div>
      )}

      <div className="vp__top">
        <div className="vp__title">{title}</div>
        {subtitle && <div className="vp__subtitle">{subtitle}</div>}
      </div>

      {waiting && !error && <div className="vp__spinner" aria-label="Loading" />}
      {error && (
        <div className="vp__error" role="alert">
          <Icon name="alert" size={32} />
          <p>{error}</p>
          <button
            className="btn btn--primary"
            onClick={() => {
              setError(null)
              setSrcIndex(0)
              if (srcIndex === 0 && el) el.load()
            }}
          >
            Try again
          </button>
        </div>
      )}
      {paused && !error && !waiting && (
        <button className="vp__bigplay" onClick={toggle} aria-label={started ? 'Resume' : 'Play'}>
          <Icon name="play" size={44} />
        </button>
      )}

      {showNextCard && next && (
        <div className="vp__next" role="dialog" aria-label="Up next">
          <span className="vp__next-kicker">Up next</span>
          <strong>{next.label}</strong>
          <div className="vp__next-actions">
            <button className="btn btn--primary btn--small" onClick={next.play}>
              <Icon name="play" size={16} /> Play now{countdown !== null ? ` (${countdown})` : ''}
            </button>
            {countdown !== null && (
              <button className="btn btn--small btn--ghost" onClick={() => setCountdown(null)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <div className="vp__controls">
        <div
          className="vp__bar"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
            setHover({ x: f * 100, t: f * duration })
          }}
          onPointerLeave={() => setHover(null)}
        >
          <div className="vp__track">
            <div className="vp__buffered" style={{ width: pct(buffered) }} />
            <div className="vp__played" style={{ width: pct(time) }} />
            <div className="vp__thumb" style={{ left: pct(time) }} />
          </div>
          {hover && duration > 0 && (
            <div className="vp__hovertime" style={{ left: `${hover.x}%` }}>
              {formatTime(hover.t)}
            </div>
          )}
          <input
            type="range"
            aria-label="Seek"
            aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
            min={0}
            max={duration || 0}
            step={0.1}
            value={time}
            onChange={(e) => el && (el.currentTime = Number(e.target.value))}
          />
        </div>

        <div className="vp__row">
          <button onClick={toggle} aria-label={paused ? 'Play' : 'Pause'} data-tip={paused ? 'Play (K)' : 'Pause (K)'}>
            <Icon name={paused ? 'play' : 'pause'} size={26} />
          </button>
          <button className="vp__skip" onClick={() => seekBy(-SEEK_STEP, true)} aria-label="Back 10 seconds" data-tip="Back 10s (J)">
            <Icon name="replay" size={24} />
            <span>10</span>
          </button>
          <button className="vp__skip" onClick={() => seekBy(SEEK_STEP, true)} aria-label="Forward 10 seconds" data-tip="Forward 10s (L)">
            <Icon name="skipForward" size={24} />
            <span>10</span>
          </button>
          <div className="vp__volume">
            <button onClick={toggleMute} aria-label={prefs.muted ? 'Unmute' : 'Mute'} data-tip="Mute (M)">
              <Icon name={prefs.muted || prefs.volume === 0 ? 'mute' : 'volume'} />
            </button>
            <input
              type="range"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={prefs.muted ? 0 : prefs.volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </div>
          <button className="vp__time" onClick={() => setShowRemaining((r) => !r)} aria-label="Toggle remaining time">
            {showRemaining ? `−${formatTime(remaining)}` : formatTime(time)} <span>/ {formatTime(duration)}</span>
          </button>
          <span className="vp__spacer" />
          {next && (
            <button onClick={next.play} aria-label={`Next: ${next.label}`} data-tip="Next episode">
              <Icon name="next" />
            </button>
          )}
          <button
            onClick={() => (tracks.length ? chooseSub(activeSub ? null : (tracks.find((t) => t.lang === prefs.subLang) ?? tracks[0])!.key) : setMenu('subtitles'))}
            aria-pressed={!!activeSub}
            aria-label="Subtitles"
            data-tip="Subtitles (C)"
            className={activeSub ? 'is-on' : ''}
          >
            <Icon name="cc" />
          </button>
          <button
            onClick={() => setMenu((m) => (m ? null : 'main'))}
            aria-label="Settings"
            aria-expanded={!!menu}
            data-tip="Settings"
            className="vp__gear"
          >
            <Icon name="settings" />
            {isHD && <span className="vp__hd">HD</span>}
          </button>
          {'pictureInPictureEnabled' in document && (
            <button
              onClick={() => (document.pictureInPictureElement ? void document.exitPictureInPicture() : void el?.requestPictureInPicture())}
              aria-label="Picture in picture"
              data-tip="Mini player"
            >
              <Icon name="pip" />
            </button>
          )}
          <button onClick={fullscreen} aria-label="Fullscreen" data-tip="Fullscreen (F)">
            <Icon name="fullscreen" />
          </button>
        </div>
      </div>

      {menu && (
        <div className="vp__menu" role="menu" onClick={(e) => e.stopPropagation()}>
          {menu === 'main' && (
            <>
              <MenuRow icon="hd" label="Quality" value={qualityLabel} onOpen={() => setMenu('quality')} />
              <MenuRow icon="cc" label="Subtitles" value={subLabel} onOpen={() => setMenu('subtitles')} />
              <MenuRow icon="speed" label="Speed" value={prefs.rate === 1 ? 'Normal' : `${prefs.rate}×`} onOpen={() => setMenu('speed')} />
              {audioTracks.length > 1 && <MenuRow icon="audio" label="Audio" value={audioTracks[audioTrack] ?? ''} onOpen={() => setMenu('audio')} />}
              <button className="vp__menu-row" role="menuitemcheckbox" aria-checked={prefs.fill} onClick={() => setPrefs({ fill: !prefs.fill })}>
                <Icon name="fit" size={20} />
                <span>Zoom to fill</span>
                <span className={`vp__switch ${prefs.fill ? 'is-on' : ''}`} />
              </button>
              <button
                className="vp__menu-row"
                role="menuitem"
                onClick={() => {
                  setMenu(null)
                  setHelp(true)
                }}
              >
                <Icon name="keyboard" size={20} />
                <span>Keyboard shortcuts</span>
              </button>
            </>
          )}
          {menu === 'quality' && (
            <>
              <MenuHeader label="Quality" onBack={() => setMenu('main')} />
              {source?.type === 'hls' && hlsLevels.length > 1 ? (
                <>
                  <Option checked={hlsLevel === -1} onClick={() => chooseLevel(-1)}>
                    Auto <small>adjusts to your connection</small>
                  </Option>
                  {hlsLevels
                    .map((l, i) => ({ ...l, i }))
                    .sort((a, b) => b.height - a.height)
                    .map((l) => (
                      <Option key={l.i} checked={hlsLevel === l.i} onClick={() => chooseLevel(l.i)}>
                        {l.height}p {l.height >= 720 && <em className="vp__hd vp__hd--inline">HD</em>}
                      </Option>
                    ))}
                </>
              ) : null}
              {qualityOptions.length > 1 || !(source?.type === 'hls' && hlsLevels.length > 1)
                ? qualityOptions.map((q) => (
                    <Option key={q.i} checked={q.i === srcIndex} onClick={() => chooseSource(q.i)}>
                      {q.label} {(sources[q.i]?.height ?? 0) >= 720 && <em className="vp__hd vp__hd--inline">HD</em>}
                    </Option>
                  ))
                : null}
              {qualityOptions.length <= 1 && hlsLevels.length <= 1 && (
                <p className="vp__menu-note">This video is only available in one quality.</p>
              )}
            </>
          )}
          {menu === 'subtitles' && (
            <>
              <MenuHeader label="Subtitles" onBack={() => setMenu('main')} />
              <Option checked={!activeSub} onClick={() => chooseSub(null)}>
                Off
              </Option>
              {tracks.map((t) => (
                <Option key={t.key} checked={activeSub === t.key} onClick={() => chooseSub(t.key)}>
                  {t.label}
                </Option>
              ))}
              {!tracks.length && <p className="vp__menu-note">No subtitles came with this video. You can load your own .srt or .vtt file.</p>}
              <label className="vp__menu-row vp__menu-upload">
                <Icon name="upload" size={20} />
                <span>Load subtitle file…</span>
                <input type="file" accept=".srt,.vtt,text/vtt" className="sr-only" onChange={(e) => void loadSubFile(e.target.files?.[0])} />
              </label>
              <div className="vp__menu-section">Text size</div>
              <div className="vp__seg">
                {SUB_SCALES.map((s) => (
                  <button key={s.v} aria-pressed={prefs.subScale === s.v} onClick={() => setPrefs({ subScale: s.v })}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="vp__menu-section">Sync</div>
              <div className="vp__stepper">
                <button onClick={() => setSubDelay((d) => Math.round((d - 0.5) * 10) / 10)} aria-label="Show subtitles earlier">
                  −0.5s
                </button>
                <span>{subDelay === 0 ? 'In sync' : `${subDelay > 0 ? '+' : ''}${subDelay.toFixed(1)}s`}</span>
                <button onClick={() => setSubDelay((d) => Math.round((d + 0.5) * 10) / 10)} aria-label="Show subtitles later">
                  +0.5s
                </button>
              </div>
            </>
          )}
          {menu === 'speed' && (
            <>
              <MenuHeader label="Speed" onBack={() => setMenu('main')} />
              {SPEEDS.map((s) => (
                <Option
                  key={s}
                  checked={prefs.rate === s}
                  onClick={() => {
                    setSpeed(s)
                    setMenu(null)
                  }}
                >
                  {s === 1 ? 'Normal' : `${s}×`}
                </Option>
              ))}
            </>
          )}
          {menu === 'audio' && (
            <>
              <MenuHeader label="Audio" onBack={() => setMenu('main')} />
              {audioTracks.map((a, i) => (
                <Option key={i} checked={audioTrack === i} onClick={() => chooseAudio(i)}>
                  {a}
                </Option>
              ))}
            </>
          )}
        </div>
      )}

      {help && (
        <div className="vp__help" role="dialog" aria-label="Keyboard shortcuts" onClick={() => setHelp(false)}>
          <div className="vp__help-card" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>Keyboard shortcuts</h3>
              <button className="icon-btn" onClick={() => setHelp(false)} aria-label="Close">
                <Icon name="close" />
              </button>
            </header>
            <dl>
              {SHORTCUTS.map(([k, v]) => (
                <div key={k}>
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="small">On phones: tap to show controls, double-tap the left or right side to skip.</p>
          </div>
        </div>
      )}
    </div>
  )
}
