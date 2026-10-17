import { useState } from 'react'
import { Row } from '../components/Row'
import { Icon } from '../components/Icon'
import { GENRES } from '../providers/audius'
import { useRecommendations, useTrendingMusic } from '../hooks/useCatalog'
import { usePlayer } from '../state/player'
import { formatTime } from '../lib/format'
import type { MediaItem } from '../providers'

function TrackList({ items }: { items: MediaItem[] }) {
  const { playQueue, enqueue, playNext } = usePlayer.getState()
  const current = usePlayer((s) => s.queue[s.index]?.id)
  return (
    <ol className="tracks">
      {items.map((t, i) => (
        <li key={t.id} className={current === t.id ? 'is-current' : ''}>
          <button className="tracks__main" onClick={() => playQueue(items, i)}>
            <span className="tracks__n">{i + 1}</span>
            {t.poster && <img src={t.poster} alt="" loading="lazy" referrerPolicy="no-referrer" />}
            <span className="tracks__text">
              <span className="tracks__title">{t.title}</span>
              <span className="tracks__artist">{t.subtitle}</span>
            </span>
            <span className="tracks__dur">{t.duration ? formatTime(t.duration) : ''}</span>
          </button>
          <button className="icon-btn" onClick={() => playNext(t)} aria-label={`Play ${t.title} next`} title="Play next">
            <Icon name="next" size={16} />
          </button>
          <button className="icon-btn" onClick={() => enqueue(t)} aria-label={`Add ${t.title} to queue`} title="Add to queue">
            <Icon name="plus" size={16} />
          </button>
        </li>
      ))}
    </ol>
  )
}

export default function Music() {
  const [genre, setGenre] = useState<string>('All')
  const trending = useTrendingMusic(genre)
  const recs = useRecommendations('track')
  const playQueue = usePlayer((s) => s.playQueue)

  return (
    <div className="page">
      <header className="page__head">
        <h1>Music</h1>
        {trending.data?.length ? (
          <button className="btn btn--primary" onClick={() => playQueue(trending.data!, 0)}>
            <Icon name="play" size={18} /> Play all
          </button>
        ) : null}
      </header>
      <p className="muted small">
        Full tracks from independent artists on Audius. Start a party and everyone hears the same song at the same moment.
      </p>
      <Row title={<><Icon name="sparkle" size={18} /> Your mix</>} items={recs.items} reasons={recs.reasons} />
      <div className="chips" role="toolbar" aria-label="Genre">
        {GENRES.map((g) => (
          <button key={g} className="chip" aria-pressed={genre === g} onClick={() => setGenre(g)}>
            {g}
          </button>
        ))}
      </div>
      {trending.error && <p className="notice">Couldn’t reach Audius: {trending.error.message}</p>}
      {trending.loading ? <p className="muted">Loading…</p> : <TrackList items={trending.data ?? []} />}
    </div>
  )
}

export { TrackList }
