import { useCallback, useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { providerFor, splitId, type MediaItem, type StreamSource } from '../providers'
import { useAsync } from '../hooks/useAsync'
import { useLibrary } from '../state/library'
import { VideoPlayer } from '../components/VideoPlayer'
import { watchPath } from '../components/PartyFollower'
import type { MediaRef } from '../lib/sync'
import { useRoom } from '../state/room'
import { Icon } from '../components/Icon'

/** `url:` ids carry a direct, user-supplied stream URL (see My files → Play a link). */
export function urlItem(url: string): MediaItem {
  let host = url
  try {
    host = new URL(url).host
  } catch {
    /* keep raw */
  }
  return { id: `url:${url}`, provider: 'url', kind: 'movie', title: decodeURIComponent(url.split('/').pop() || host), subtitle: host, tags: [] }
}

export default function Watch() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const fullId = decodeURIComponent(id)
  const ep = params.get('ep') ?? undefined
  const [pid, nativeId] = splitId(fullId)
  const provider = providerFor(fullId)
  const lib = useLibrary()
  const remoteItem = useRoom((s) => (s.remote?.event.media.id === fullId ? (s.remote.event.media.item as MediaItem | undefined) : undefined))

  const item = useAsync<MediaItem | null>(async () => {
    if (pid === 'url') return urlItem(nativeId)
    return (await provider?.details(nativeId)) ?? remoteItem ?? null
  }, [fullId])

  const sources = useAsync<StreamSource[]>(async () => {
    if (pid === 'url') return [{ url: nativeId, type: /\.m3u8(\?|$)/i.test(nativeId) ? 'hls' : 'file' }]
    if (!provider?.stream) return []
    return provider.stream(ep ?? nativeId)
  }, [fullId, ep])

  const episodes = useAsync(async () => (ep && provider?.episodes ? provider.episodes(nativeId) : []), [fullId, !!ep])
  const epIndex = episodes.data?.findIndex((e) => e.id === ep) ?? -1
  const nextEp = epIndex >= 0 ? episodes.data?.[epIndex + 1] : undefined
  const thisEp = epIndex >= 0 ? episodes.data?.[epIndex] : undefined

  const party = useMemo<MediaRef | null>(
    () => (item.data ? { id: fullId, title: item.data.title, kind: 'video', streamId: ep, item: item.data } : null),
    [item.data, fullId, ep],
  )

  const saved = lib.progress[fullId]
  const startAt = saved && saved.streamId === ep ? saved.position : 0
  const it = item.data

  const onProgress = useCallback(
    (position: number, duration: number) => {
      if (!it) return
      const s = useLibrary.getState()
      s.setProgress(it, { position, duration, streamId: ep })
      if (duration && position / duration > 0.9) s.record(it, 'complete')
      else if (position > 120 && !s.history.some((h) => h.item.id === it.id && h.signal === 'progress')) s.record(it, 'progress')
    },
    [it, ep],
  )
  const next = useMemo(
    () =>
      nextEp
        ? { label: `E${nextEp.number ?? ''} · ${nextEp.title}`, play: () => navigate(watchPath(fullId, nextEp.id), { replace: true }) }
        : undefined,
    [nextEp, navigate, fullId],
  )

  return (
    <div className="page page--watch">
      {sources.loading || item.loading ? (
        <div className="vp vp--loading" aria-busy />
      ) : sources.data?.length ? (
        <VideoPlayer
          sources={sources.data}
          poster={it?.backdrop ?? it?.poster}
          title={it?.title ?? ''}
          subtitle={thisEp ? `Episode ${thisEp.number}: ${thisEp.title}` : undefined}
          startAt={startAt}
          party={party}
          onProgress={onProgress}
          next={next}
        />
      ) : (
        <div className="vp vp--empty">
          <p>{sources.error?.message ?? 'No playable source for this title.'}</p>
        </div>
      )}
      <div className="watch__meta">
        <div>
          <h1>{it?.title}</h1>
          {thisEp && <p className="muted">Episode {thisEp.number}: {thisEp.title}</p>}
        </div>
        <div className="watch__actions">
          {nextEp && (
            <Link className="btn" to={watchPath(fullId, nextEp.id)} replace>
              Next episode ›
            </Link>
          )}
          {pid !== 'url' && (
            <Link className="btn btn--ghost" to={`/title/${encodeURIComponent(fullId)}`}>
              Details
            </Link>
          )}
        </div>
      </div>
      <p className="small muted watch__hint">
        <Icon name="info" size={14} />
        <span className="hint--mouse">
          Tip: double-click the left or right side of the video to skip 10 seconds. Press <kbd>?</kbd> for all shortcuts.
        </span>
        <span className="hint--touch">Tip: double-tap the left or right side of the video to skip 10 seconds.</span>
      </p>
    </div>
  )
}
