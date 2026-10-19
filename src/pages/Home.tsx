import { Link, useOutletContext } from 'react-router-dom'
import { Row } from '../components/Row'
import { Icon, type IconName } from '../components/Icon'
import { useRecommendations, useTrending, useTrendingMusic } from '../hooks/useCatalog'
import { continueWatching, useLibrary } from '../state/library'
import { useSettings } from '../state/settings'
import type { MediaItem } from '../providers'
import { anilist } from '../providers/anilist'
import { useAsync } from '../hooks/useAsync'
import { useEffect } from 'react'

function Welcome() {
  return (
    <section className="hero hero--welcome">
      <div className="hero__content">
        <span className="pill">
          <Icon name="shield" size={14} /> No ads · No trackers · No sign-up
        </span>
        <h1>Movies, shows and music. Together.</h1>
        <p className="hero__desc">
          Stream free classics, your own media library and independent music, then invite friends to watch in sync
          with chat and voice.
        </p>
        <div className="hero__actions">
          <Link className="btn btn--primary btn--lg" to="/movies">
            <Icon name="play" /> Browse free movies
          </Link>
          <Link className="btn btn--lg" to="/local">
            <Icon name="upload" /> Play my files
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
          <Icon name="sparkle" size={14} /> Featured · free to watch
        </span>
        <h1>{item.title}</h1>
        <p className="hero__meta">{[item.year, item.kind === 'series' ? 'TV show' : 'Movie', ...item.tags.slice(0, 2)].filter(Boolean).join(' · ')}</p>
        <p className="hero__desc">{item.description?.slice(0, 220)}</p>
        <div className="hero__actions">
          <Link className="btn btn--primary btn--lg" to={`/title/${encodeURIComponent(item.id)}`}>
            <Icon name="play" /> Watch now
          </Link>
          <Link className="btn btn--lg btn--glass" to={`/title/${encodeURIComponent(item.id)}`}>
            <Icon name="info" /> More info
          </Link>
        </div>
      </div>
    </section>
  )
}

const STEPS: { icon: IconName; title: string; text: string; to?: string; cta: string; party?: boolean }[] = [
  { icon: 'film', title: 'Watch free classics', text: 'Thousands of public-domain films, TV episodes and cartoons, ready to stream.', to: '/movies', cta: 'Browse movies' },
  { icon: 'upload', title: 'Play your own videos', text: 'Open a video from your device, or connect your Jellyfin server in Settings.', to: '/local', cta: 'Open My Files' },
  { icon: 'users', title: 'Watch together', text: 'Start a party, share the link, and everyone’s player stays in sync. Chat and talk, too.', cta: 'Start a party', party: true },
]

function StartHere() {
  const onboarded = useSettings((s) => s.onboarded)
  const set = useSettings((s) => s.set)
  const { openParty } = useOutletContext<{ openParty: () => void }>()
  if (onboarded) return null
  return (
    <section className="start" aria-labelledby="start-title">
      <header className="start__head">
        <h2 id="start-title">New here? Three things you can do</h2>
        <button className="btn btn--small btn--ghost" onClick={() => set({ onboarded: true })}>
          Got it, hide this
        </button>
      </header>
      <ol className="start__steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="start__step">
            <span className="start__num" aria-hidden>
              {i + 1}
            </span>
            <Icon name={s.icon} size={26} />
            <h3>{s.title}</h3>
            <p>{s.text}</p>
            {s.party ? (
              <button className="btn btn--small" onClick={openParty}>
                {s.cta}
              </button>
            ) : (
              <Link className="btn btn--small" to={s.to!}>
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function Home() {
  const movies = useTrending('movie')
  const series = useTrending('series')
  const music = useTrendingMusic()
  const anime = useAsync(() => anilist.freeOnYouTube(), [])
  const addToPool = useLibrary((s) => s.addToPool)
  useEffect(() => {
    if (anime.data?.length) addToPool(anime.data)
  }, [anime.data, addToPool])
  const recs = useRecommendations('video')
  const musicRecs = useRecommendations('track')
  const progress = useLibrary((s) => s.progress)
  const history = useLibrary((s) => s.history)
  const watchlist = useLibrary((s) => s.watchlist)
  const hasKey = useSettings((s) => !!s.tmdbKey)
  const featured = (movies.data ?? []).find((m) => m.provider !== 'tmdb' && m.backdrop) ?? movies.data?.find((m) => m.provider !== 'tmdb')

  return (
    <div className="page page--home">
      <Hero item={featured} loading={movies.loading} />
      <StartHere />
      <Row title="Continue watching" subtitle="Pick up where you left off" items={continueWatching(progress, history)} />
      <Row
        title={
          <>
            <Icon name="sparkle" size={18} /> Picked for you
          </>
        }
        subtitle="Based on what you watch and like. Worked out on this device only."
        items={recs.items}
        reasons={recs.reasons}
      />
      <Row title="My List" subtitle="Things you saved for later" items={watchlist} />
      <Row
        title="Popular movies"
        subtitle="Free to watch, no sign-up"
        items={movies.data ?? []}
        loading={movies.loading}
        error={movies.error}
        onRetry={movies.reload}
        action={<Link to="/movies">See all</Link>}
      />
      <Row
        title="Popular TV & cartoons"
        subtitle="Classic episodes, free to stream"
        items={series.data ?? []}
        loading={series.loading}
        error={series.error}
        onRetry={series.reload}
        action={<Link to="/series">See all</Link>}
      />
      <Row
        title="Free anime"
        subtitle="Official releases from the rights holders, free to watch here"
        items={anime.data ?? []}
        loading={anime.loading}
        error={anime.error}
        onRetry={anime.reload}
        action={<Link to="/anime">All anime</Link>}
      />
      <Row title="Music for you" subtitle="Based on what you’ve listened to" items={musicRecs.items} reasons={musicRecs.reasons} />
      <Row
        title="Trending music"
        subtitle="Tap a track to play. It keeps playing while you browse."
        items={music.data ?? []}
        loading={music.loading}
        error={music.error}
        onRetry={music.reload}
        action={<Link to="/music">Open Music</Link>}
      />
      {!hasKey && (
        <aside className="tip">
          <Icon name="info" />
          <span>
            Want posters, trailers and links to where new releases are streaming legally? Add a free TMDB key in{' '}
            <Link to="/settings">Settings</Link>.
          </span>
        </aside>
      )}
    </div>
  )
}
