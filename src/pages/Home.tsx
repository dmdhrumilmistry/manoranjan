import { Link } from 'react-router-dom'
import { Row } from '../components/Row'
import { Icon } from '../components/Icon'
import { useRecommendations, useTrending, useTrendingMusic } from '../hooks/useCatalog'
import { continueWatching, useLibrary } from '../state/library'
import { useSettings } from '../state/settings'
import type { MediaItem } from '../providers'

function Welcome() {
  return (
    <section className="hero hero--welcome">
      <div className="hero__content">
        <span className="pill">
          <Icon name="shield" size={14} /> Ad-free · tracker-free
        </span>
        <h1>Watch, listen and hang out together.</h1>
        <p className="hero__desc">
          Public-domain classics, your own Jellyfin library, independent music and files from your computer, with watch
          parties, chat and voice. No accounts, and nothing leaves your browser.
        </p>
        <div className="hero__actions">
          <Link className="btn btn--primary btn--lg" to="/local">
            <Icon name="upload" /> Play my files
          </Link>
          <Link className="btn btn--lg" to="/music">
            <Icon name="music" /> Music
          </Link>
        </div>
      </div>
    </section>
  )
}

function Hero({ item, loading }: { item?: MediaItem; loading: boolean }) {
  if (!item) return loading ? <div className="hero hero--skeleton" aria-hidden /> : <Welcome />
  return (
    <section className="hero" style={{ backgroundImage: item.backdrop || item.poster ? `url("${item.backdrop ?? item.poster}")` : undefined }}>
      <div className="hero__shade" />
      <div className="hero__content">
        <span className="pill">
          <Icon name="sparkle" size={14} /> Featured
        </span>
        <h1>{item.title}</h1>
        <p className="hero__desc">{item.description?.slice(0, 220)}</p>
        <div className="hero__actions">
          <Link className="btn btn--primary btn--lg" to={`/title/${encodeURIComponent(item.id)}`}>
            <Icon name="play" /> Watch now
          </Link>
        </div>
      </div>
    </section>
  )
}

export function Home() {
  const movies = useTrending('movie')
  const series = useTrending('series')
  const music = useTrendingMusic()
  const recs = useRecommendations('video')
  const musicRecs = useRecommendations('track')
  const progress = useLibrary((s) => s.progress)
  const history = useLibrary((s) => s.history)
  const watchlist = useLibrary((s) => s.watchlist)
  const hasKey = useSettings((s) => !!s.tmdbKey)
  const featured = (movies.data ?? []).find((m) => m.backdrop) ?? movies.data?.[0]

  return (
    <div className="page page--home">
      <Hero item={featured} loading={movies.loading} />
      {movies.error && (
        <p className="notice" role="status">
          Couldn’t load some sources: {movies.error.message}
        </p>
      )}
      <Row title="Continue watching" items={continueWatching(progress, history)} />
      <Row
        title={
          <>
            <Icon name="sparkle" size={18} /> Picked for you
          </>
        }
        items={recs.items}
        reasons={recs.reasons}
      />
      <Row title="My list" items={watchlist} />
      <Row title="Trending films" items={movies.data ?? []} loading={movies.loading} action={<Link to="/movies">See all</Link>} />
      <Row title="Trending series" items={series.data ?? []} loading={series.loading} action={<Link to="/series">See all</Link>} />
      <Row title="Music for you" items={musicRecs.items} reasons={musicRecs.reasons} />
      <Row title="Trending music" items={music.data ?? []} loading={music.loading} action={<Link to="/music">Open music</Link>} />
      {!hasKey && (
        <aside className="tip">
          <Icon name="sparkle" />
          <span>
            Add a free TMDB key in <Link to="/settings">Settings</Link> for posters, trailers and legal “where to watch” links on
            current releases.
          </span>
        </aside>
      )}
    </div>
  )
}
