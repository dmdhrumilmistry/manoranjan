import { memo } from 'react'
import { Link } from 'react-router-dom'
import type { MediaItem } from '../providers/types'
import { useLibrary } from '../state/library'
import { usePlayer } from '../state/player'
import { Icon } from './Icon'

const PROVIDER_LABEL: Record<string, string> = {
  archive: 'Public domain',
  jellyfin: 'My library',
  tmdb: 'Info',
  audius: 'Audius',
  url: 'Link',
}

export const MediaCard = memo(function MediaCard({ item, reason, list }: { item: MediaItem; reason?: string; list?: MediaItem[] }) {
  const progress = useLibrary((s) => s.progress[item.id])
  const playQueue = usePlayer((s) => s.playQueue)
  const pct = progress && progress.duration ? Math.min(100, (progress.position / progress.duration) * 100) : 0
  const isTrack = item.kind === 'track'

  const body = (
    <>
      <div className={`card__art ${isTrack ? 'card__art--square' : ''}`}>
        {item.poster ? (
          <img src={item.poster} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        ) : (
          <div className="card__placeholder" aria-hidden>
            {item.title.slice(0, 1)}
          </div>
        )}
        <span className="card__badge">{PROVIDER_LABEL[item.provider]}</span>
        <span className="card__play" aria-hidden>
          <Icon name="play" size={28} />
        </span>
        {pct > 0 && (
          <div className="card__progress" aria-label={`${Math.round(pct)}% watched`}>
            <div style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="card__meta">
        <div className="card__title" title={item.title}>
          {item.title}
        </div>
        <div className="card__sub">
          {reason ? (
            <span className="card__reason">
              <Icon name="sparkle" size={12} /> {reason}
            </span>
          ) : (
            [item.subtitle, item.year].filter(Boolean).join(' · ')
          )}
        </div>
      </div>
    </>
  )

  if (isTrack) {
    const queue = list ?? [item]
    return (
      <button className="card" onClick={() => playQueue(queue, Math.max(0, queue.findIndex((q) => q.id === item.id)))}>
        {body}
      </button>
    )
  }
  return (
    <Link className="card" to={`/title/${encodeURIComponent(item.id)}`}>
      {body}
    </Link>
  )
})
