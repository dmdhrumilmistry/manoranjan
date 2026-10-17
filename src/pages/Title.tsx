import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { archive, jellyfin, providerFor, splitId, tmdb, type MediaItem } from '../providers'
import { useAsync } from '../hooks/useAsync'
import { useLibrary } from '../state/library'
import { recommend } from '../lib/recommender'
import { formatTime } from '../lib/format'
import { Row } from '../components/Row'
import { Icon } from '../components/Icon'
import { watchPath } from '../components/PartyFollower'

const OFFER_LABEL = { flatrate: 'Stream', free: 'Free', ads: 'Free with ads', rent: 'Rent', buy: 'Buy' } as const

/** For metadata-only titles, look for a playable legal copy in the user's library or the public domain. */
function usePlayableMatches(item: MediaItem | null | undefined) {
  return useAsync(async () => {
    if (!item || item.provider !== 'tmdb') return []
    const tries = [jellyfin, archive].filter((p) => p.enabled())
    const found = await Promise.allSettled(tries.map((p) => p.search(item.title)))
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    return found
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .filter((m) => norm(m.title).includes(norm(item.title)) && (!item.year || !m.year || Math.abs(m.year - item.year) <= 1))
      .slice(0, 6)
  }, [item?.id])
}

export default function Title() {
  const { id = '' } = useParams()
  const fullId = decodeURIComponent(id)
  const [, nativeId] = splitId(fullId)
  const provider = providerFor(fullId)
  const lib = useLibrary()
  const details = useAsync(async () => (provider ? provider.details(nativeId) : null), [fullId])
  const item = details.data
  const extras = useAsync(async () => (provider?.id === 'tmdb' ? tmdb.extras(nativeId) : null), [fullId])
  const episodes = useAsync(async () => (item?.kind === 'series' && provider?.episodes ? provider.episodes(nativeId) : []), [item?.id, item?.kind])
  const matches = usePlayableMatches(item)
  const rating = lib.rating(fullId)
  const inList = lib.watchlist.some((w) => w.id === fullId)
  const progress = lib.progress[fullId]

  useEffect(() => {
    if (item) lib.record(item, 'view')
    if (extras.data?.similar.length) lib.addToPool(extras.data.similar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, extras.data])

  const similar = useMemo(() => {
    if (!item) return []
    const pool = lib.pool.filter((p) => p.id !== item.id && p.kind !== 'track')
    return recommend([{ item, signal: 'like', at: Date.now() }], pool, 16).map((r) => r.item)
  }, [item, lib.pool])

  if (details.loading) return <div className="page-loading" aria-busy />
  if (!item) return <div className="empty"><h1>Title not found</h1><p className="muted">{details.error?.message}</p></div>

  const canPlay = item.provider !== 'tmdb'
  const firstEp = episodes.data?.[0]

  return (
    <div className="page page--title">
      <section className="detail" style={{ backgroundImage: item.backdrop ? `url("${item.backdrop}")` : undefined }}>
        <div className="detail__shade" />
        <div className="detail__inner">
          {item.poster && <img className="detail__poster" src={item.poster} alt="" referrerPolicy="no-referrer" />}
          <div className="detail__info">
            <h1>{item.title}</h1>
            <div className="detail__meta">
              {[item.year, item.kind === 'series' ? 'Series' : 'Film', item.duration ? formatTime(item.duration) : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <div className="chips">
              {item.tags.filter((t) => !t.includes(':')).slice(0, 8).map((t) => (
                <span key={t} className="chip chip--static">{t}</span>
              ))}
            </div>
            <p className="detail__desc">{item.description}</p>
            <div className="detail__actions">
              {canPlay && (item.kind !== 'series' || firstEp) && (
                <Link
                  className="btn btn--primary btn--lg"
                  to={watchPath(item.id, item.kind === 'series' ? progress?.streamId ?? firstEp?.id : undefined)}
                >
                  <Icon name="play" /> {progress ? 'Resume' : 'Play'}
                </Link>
              )}
              <button className="btn" onClick={() => lib.toggleWatchlist(item)} aria-pressed={inList}>
                <Icon name={inList ? 'check' : 'plus'} size={18} /> My list
              </button>
              <button className="icon-btn" aria-pressed={rating === 'like'} onClick={() => lib.record(item, 'like')} aria-label="I like this">
                <Icon name="thumbsUp" size={18} />
              </button>
              <button className="icon-btn" aria-pressed={rating === 'dislike'} onClick={() => lib.record(item, 'dislike')} aria-label="Not for me">
                <Icon name="thumbsDown" size={18} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {extras.data?.trailerKey && (
        <section className="section">
          <h2>Trailer</h2>
          <div className="embed">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(extras.data.trailerKey)}?rel=0&modestbranding=1`}
              title={`${item.title} trailer`}
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allow="encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          </div>
        </section>
      )}

      {provider?.id === 'tmdb' && (
        <section className="section">
          <h2>Where to watch</h2>
          {matches.data && matches.data.length > 0 && (
            <>
              <p className="muted">Playable here:</p>
              <Row title="" items={matches.data} />
            </>
          )}
          {extras.data?.offers.length ? (
            <ul className="offers">
              {extras.data.offers.map((o) => (
                <li key={o.provider}>
                  <a href={extras.data!.offersLink} className="offer">
                    <img src={o.logo} alt="" referrerPolicy="no-referrer" />
                    <span>{o.provider}</span>
                    <small>{OFFER_LABEL[o.type]}</small>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            !extras.loading && <p className="muted">No licensed streaming offers found for your region.</p>
          )}
          <p className="small muted">Availability data by JustWatch via TMDB.</p>
        </section>
      )}

      {item.kind === 'series' && (
        <section className="section">
          <h2>Episodes</h2>
          {episodes.loading ? (
            <p className="muted">Loading episodes…</p>
          ) : episodes.data?.length ? (
            <ol className="episodes">
              {episodes.data.map((e) => (
                <li key={e.id}>
                  <Link to={watchPath(item.id, e.id)} className={progress?.streamId === e.id ? 'is-current' : ''}>
                    {e.thumbnail && <img src={e.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                    <span className="episodes__num">{e.season ? `S${e.season} · ` : ''}E{e.number ?? '?'}</span>
                    <span className="episodes__title">{e.title}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No playable episodes.</p>
          )}
        </section>
      )}

      <Row title="More like this" items={similar.length ? similar : extras.data?.similar ?? []} />
    </div>
  )
}
