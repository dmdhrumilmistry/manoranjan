import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { anilist, archive, jellyfin, providerFor, splitId, tmdb, type MediaItem } from '../providers'
import { useAsync } from '../hooks/useAsync'
import { useLibrary } from '../state/library'
import { recommend } from '../lib/recommender'
import { formatTime } from '../lib/format'
import { Row } from '../components/Row'
import { Icon } from '../components/Icon'
import { watchPath } from '../components/PartyFollower'

/** Recommender-only tags that shouldn't show up as genre chips. */
const INTERNAL_TAGS = new Set(['anime', 'free on youtube'])

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
  const anime = useAsync(async () => (provider?.id === 'anilist' ? anilist.extras(nativeId) : null), [fullId])
  const episodes = useAsync(async () => (item?.kind === 'series' && provider?.episodes ? provider.episodes(nativeId) : []), [item?.id, item?.kind])
  const matches = usePlayableMatches(item)
  const rating = lib.rating(fullId)
  const inList = lib.watchlist.some((w) => w.id === fullId)
  const progress = lib.progress[fullId]

  useEffect(() => {
    if (item) lib.record(item, 'view')
    if (extras.data?.similar.length) lib.addToPool(extras.data.similar)
    if (anime.data?.similar.length) lib.addToPool(anime.data.similar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, extras.data, anime.data])

  const similar = useMemo(() => {
    if (!item) return []
    const pool = lib.pool.filter((p) => p.id !== item.id && p.kind !== 'track')
    return recommend([{ item, signal: 'like', at: Date.now() }], pool, 16).map((r) => r.item)
  }, [item, lib.pool])

  if (details.loading) return <div className="page-loading" aria-busy />
  if (!item)
    return (
      <div className="empty">
        <h1>{details.error ? 'Couldn’t load this title' : 'Title not found'}</h1>
        <p className="muted">{details.error ? 'The source may be busy or offline. Please try again.' : 'It may have been removed from its source.'}</p>
        <div className="hero__actions">
          {details.error && <button className="btn btn--primary" onClick={details.reload}>Try again</button>}
          <Link className="btn" to="/">Back to Home</Link>
        </div>
      </div>
    )

  const isAnime = item.provider === 'anilist'
  // Anime is playable only when the rights holder published it free on YouTube.
  const canPlay = isAnime ? !!anime.data?.youtube || !!anime.data?.episodes.length : item.provider !== 'tmdb'
  const deciding = isAnime && anime.loading
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
              {item.tags.filter((t) => !t.includes(':') && !INTERNAL_TAGS.has(t)).slice(0, 8).map((t) => (
                <span key={t} className="chip chip--static">{t}</span>
              ))}
            </div>
            <p className="detail__desc">{item.description}</p>
            <div className="detail__actions">
              {canPlay && (item.kind !== 'series' || firstEp || isAnime) && (
                <Link
                  className="btn btn--primary btn--lg"
                  to={watchPath(item.id, item.kind === 'series' ? progress?.streamId ?? firstEp?.id : undefined)}
                >
                  <Icon name="play" /> {progress ? 'Resume' : 'Play'}
                </Link>
              )}
              {!canPlay && !deciding && (
                <a className="btn btn--primary btn--lg" href="#where-to-watch" onClick={(e) => { e.preventDefault(); document.getElementById('where-to-watch')?.scrollIntoView({ behavior: 'smooth' }) }}>
                  <Icon name="external" size={18} /> Where to watch
                </a>
              )}
              <button className="btn btn--glass" onClick={() => lib.toggleWatchlist(item)} aria-pressed={inList}>
                <Icon name={inList ? 'check' : 'plus'} size={18} /> {inList ? 'In My List' : 'My List'}
              </button>
              <div className="rate" role="group" aria-label="Rate this to improve recommendations">
                <button className="icon-btn" aria-pressed={rating === 'like'} onClick={() => lib.record(item, 'like')} aria-label="I like this" title="I like this: show me more like it">
                  <Icon name="thumbsUp" size={18} />
                </button>
                <button className="icon-btn" aria-pressed={rating === 'dislike'} onClick={() => lib.record(item, 'dislike')} aria-label="Not for me" title="Not for me: show me less like it">
                  <Icon name="thumbsDown" size={18} />
                </button>
              </div>
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
        <section className="section" id="where-to-watch">
          <h2>Where to watch</h2>
          <p className="callout">
            <Icon name="info" size={18} />
            <span>
              This title isn’t free to stream here. If a free copy or a copy in your own library exists, it’s listed below. Otherwise,
              these are the services that stream it legally.
            </span>
          </p>
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

      {isAnime && (
        <section className="section" id="where-to-watch">
          <h2>{canPlay ? 'Also streaming on' : 'Where to watch'}</h2>
          {canPlay ? (
            <p className="callout callout--ok">
              <Icon name="check" size={18} />
              <span>The rights holder has published this free on YouTube, so you can watch it right here.</span>
            </p>
          ) : (
            !deciding && (
              <p className="callout">
                <Icon name="info" size={18} />
                <span>This anime isn’t free to stream here. These services carry it legally (availability varies by country).</span>
              </p>
            )
          )}
          {anime.data?.links.length ? (
            <ul className="offers">
              {anime.data.links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} className="offer" style={l.color ? ({ '--offer': l.color } as React.CSSProperties) : undefined}>
                    {l.icon ? <img src={l.icon} alt="" referrerPolicy="no-referrer" /> : <Icon name="external" size={18} />}
                    <span>{l.site}</span>
                    {l.language && <small>{l.language}</small>}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            !anime.loading && !canPlay && <p className="muted">No official streaming links are listed for this title yet.</p>
          )}
          <p className="small muted">Anime data and streaming links from AniList.</p>
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
                    {e.thumbnail && (
                      <img
                        src={e.thumbnail}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(ev) => (ev.currentTarget.style.visibility = 'hidden')}
                      />
                    )}
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

      <Row
        title="More like this"
        subtitle="Similar titles you might enjoy"
        items={isAnime && anime.data?.similar.length ? anime.data.similar : similar.length ? similar : (extras.data?.similar ?? [])}
      />
    </div>
  )
}
