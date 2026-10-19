import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { VideoPlayer } from '../components/VideoPlayer'
import { Icon } from '../components/Icon'
import { useRoom } from '../state/room'
import type { StreamSource } from '../providers'
import { guessLang, isSubtitleFile, vttBlobUrl } from '../lib/subtitles'
import { toast } from '../state/toast'

type Capturable = HTMLMediaElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }

interface LocalFile {
  key: string
  file: File
  url: string
}

/** "Movie.en.srt" belongs to "Movie.mkv". */
const stem = (name: string) => name.replace(/\.[^.]+$/, '').replace(/\.[a-z]{2,3}$/i, '').toLowerCase()

/**
 * Play files from this computer. Nothing is uploaded: files are read through
 * blob: URLs. In a party, the host can live-stream the playing file (or a
 * screen/tab) to everyone over WebRTC.
 */
export default function Local() {
  const navigate = useNavigate()
  const { openParty } = useOutletContext<{ openParty: () => void }>()
  const [files, setFiles] = useState<LocalFile[]>([])
  const [current, setCurrent] = useState<LocalFile | null>(null)
  const [link, setLink] = useState('')
  const [castError, setCastError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const elRef = useRef<Capturable | null>(null)
  const inRoom = useRoom((s) => !!s.roomId)
  const casting = useRoom((s) => s.casting)
  const { startCast, stopCast } = useRoom.getState()

  const [subs, setSubs] = useState<{ file: File; url: string }[]>([])

  const add = (list: FileList | null) => {
    const subFiles = Array.from(list ?? []).filter((f) => isSubtitleFile(f.name))
    if (subFiles.length) {
      void Promise.all(subFiles.map(async (file) => ({ file, url: vttBlobUrl(await file.text()) }))).then((loaded) => {
        setSubs((s) => [...s, ...loaded])
        toast(`${loaded.length} subtitle file${loaded.length > 1 ? 's' : ''} added`, 'success')
      })
    }
    const media = Array.from(list ?? []).filter((f) => /^(video|audio)\//.test(f.type) || /\.(mkv|mp4|webm|mov|mp3|flac|m4a|ogg|wav)$/i.test(f.name))
    const next = media.map((file) => ({ key: `${file.name}-${file.size}-${file.lastModified}`, file, url: URL.createObjectURL(file) }))
    setFiles((f) => [...f, ...next.filter((n) => !f.some((x) => x.key === n.key))])
    if (!current && next[0]) setCurrent(next[0])
  }

  // Release blob URLs when the page unmounts.
  const filesRef = useRef(files)
  filesRef.current = files
  const subsRef = useRef(subs)
  subsRef.current = subs
  useEffect(
    () => () => {
      filesRef.current.forEach((f) => URL.revokeObjectURL(f.url))
      subsRef.current.forEach((s) => URL.revokeObjectURL(s.url))
    },
    [],
  )

  const sources = useMemo<StreamSource[]>(() => {
    if (!current) return []
    // Subtitles named after this video come first; any others are still selectable.
    const mine = stem(current.file.name)
    const subtitles = [...subs]
      .sort((a, b) => Number(stem(b.file.name) === mine) - Number(stem(a.file.name) === mine))
      .map((s) => ({ src: s.url, ...guessLang(s.file.name) }))
    return [{ url: current.url, type: 'file', mime: current.file.type, label: 'Original', subtitles }]
  }, [current, subs])

  const cast = useCallback(() => {
    setCastError(null)
    const el = elRef.current
    const capture = el?.captureStream?.bind(el) ?? el?.mozCaptureStream?.bind(el)
    if (!el || !capture || !current) return setCastError('Your browser cannot capture video for streaming. Try Chrome, Edge or Firefox.')
    if (el.paused) void el.play().catch(() => {})
    startCast(capture(), current.file.name)
  }, [current, startCast])

  const shareScreen = async () => {
    setCastError(null)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true })
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stopCast())
      startCast(stream, 'Screen share')
    } catch (e) {
      setCastError(e instanceof Error ? e.message : 'Screen sharing was cancelled')
    }
  }

  // Switching files while casting restarts the cast with the new file's tracks.
  useEffect(() => {
    if (useRoom.getState().casting && useRoom.getState().casting !== 'Screen share' && current) {
      const t = setTimeout(cast, 500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key])

  return (
    <div className="page">
      <header className="page__head">
        <h1>My files</h1>
      </header>

      <label
        className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          add(e.dataTransfer.files)
        }}
      >
        <Icon name="upload" size={32} />
        <strong>Drop video, audio or subtitle files here, or click to choose</strong>
        <span className="muted small">
          Plays right in your browser. Nothing is uploaded. Add an .srt or .vtt file with the same name to get subtitles.
        </span>
        <input type="file" accept="video/*,audio/*,.mkv,.srt,.vtt" multiple onChange={(e) => add(e.target.files)} className="sr-only" />
      </label>

      {current && (
        <>
          <VideoPlayer
            key={current.key}
            sources={sources}
            title={current.file.name}
            party={null}
            onElement={(el) => (elRef.current = el as Capturable | null)}
          />
          <div className="watch__meta">
            <h2>{current.file.name}</h2>
            <div className="watch__actions">
              {inRoom ? (
                casting ? (
                  <button className="btn btn--danger" onClick={stopCast}>
                    Stop streaming to party
                  </button>
                ) : (
                  <button className="btn btn--primary" onClick={cast}>
                    <Icon name="screen" size={18} /> Stream to party
                  </button>
                )
              ) : (
                <button className="btn" onClick={openParty}>
                  <Icon name="users" size={18} /> Start a party to stream this
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {inRoom && !casting && (
        <button className="btn btn--ghost" onClick={() => void shareScreen()}>
          <Icon name="screen" size={18} /> Share a screen or tab instead
        </button>
      )}
      {castError && <p className="error">{castError}</p>}

      {files.length > 0 && (
        <ul className="filelist">
          {files.map((f) => (
            <li key={f.key}>
              <button className={current?.key === f.key ? 'is-current' : ''} onClick={() => setCurrent(f)}>
                <Icon name={f.file.type.startsWith('audio') ? 'music' : 'film'} size={18} />
                <span>{f.file.name}</span>
                <small className="muted">{(f.file.size / 1e6).toFixed(0)} MB</small>
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="section">
        <h2>Play a link</h2>
        <p className="muted small">
          A direct MP4/WebM/HLS (.m3u8) URL you’re allowed to use. In a party, everyone loads the same link in sync.
        </p>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            try {
              const u = new URL(link.trim())
              if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error()
              navigate(`/watch/${encodeURIComponent(`url:${u.href}`)}`)
            } catch {
              setCastError('Enter a valid http(s) URL')
            }
          }}
        >
          <input type="url" placeholder="https://example.org/video.mp4" value={link} onChange={(e) => setLink(e.target.value)} />
          <button className="btn btn--primary" type="submit">
            Play
          </button>
        </form>
      </section>
    </div>
  )
}
