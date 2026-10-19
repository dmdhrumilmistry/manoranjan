import { useEffect, useState } from 'react'
import { Grid, Row, ErrorNote } from '../components/Row'
import { Icon } from '../components/Icon'
import { useAsync } from '../hooks/useAsync'
import { anilist, ANIME_GENRES, currentSeason } from '../providers/anilist'
import { useLibrary } from '../state/library'
import type { MediaItem } from '../providers'

const SEASON_LABEL = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' } as const

/** Feeds the on-device recommender with everything browsed here. */
function useAnimeFeed(fn: () => Promise<MediaItem[]>, deps: unknown[]) {
  const addToPool = useLibrary((s) => s.addToPool)
  const state = useAsync(fn, deps)
  useEffect(() => {
    if (state.data?.length) addToPool(state.data)
  }, [state.data, addToPool])
  return state
}

export default function Anime() {
  const [genre, setGenre] = useState<string>('')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const free = useAnimeFeed(() => anilist.freeOnYouTube(genre), [genre])
  const trending = useAnimeFeed(() => anilist.trendingNow(genre), [genre])
  const season = useAnimeFeed(() => anilist.thisSeason(genre), [genre])
  const top = useAnimeFeed(() => anilist.topRated(genre), [genre])
  const results = useAnimeFeed(() => (submitted ? anilist.search(submitted) : Promise.resolve([])), [submitted])
  const { season: s, year } = currentSeason()

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>Anime</h1>
          <p className="muted">
            Shows marked <span className="inline-badge inline-badge--free">Free</span> are official releases the rights holders
            put on YouTube, and you can watch them here. For everything else, each title links to the services that stream it
            legally.
          </p>
        </div>
      </header>

      <form
        className="anime-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(query.trim())
        }}
      >
        <Icon name="search" size={18} />
        <input type="search" placeholder="Search anime by title…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search anime" />
        {submitted && (
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => {
              setQuery('')
              setSubmitted('')
            }}
          >
            Clear
          </button>
        )}
      </form>

      {submitted ? (
        <section className="section">
          <h2>Results for “{submitted}”</h2>
          <ErrorNote error={results.error} onRetry={results.reload} what="anime" />
          {!results.loading && !results.error && !results.data?.length ? (
            <p className="muted">No anime found. Try the English or Japanese title.</p>
          ) : (
            <Grid items={results.data ?? []} loading={results.loading} />
          )}
        </section>
      ) : (
        <>
          <div className="chips" role="toolbar" aria-label="Filter by genre">
            <button className="chip" aria-pressed={!genre} onClick={() => setGenre('')}>
              All genres
            </button>
            {ANIME_GENRES.map((g) => (
              <button key={g} className="chip" aria-pressed={genre === g} onClick={() => setGenre(genre === g ? '' : g)}>
                {g}
              </button>
            ))}
          </div>
          <Row
            title={
              <>
                <Icon name="play" size={18} /> Free to watch
              </>
            }
            subtitle="Official free releases on YouTube that play right here"
            items={free.data ?? []}
            loading={free.loading}
            error={free.error}
            onRetry={free.reload}
          />
          {!free.loading && !free.error && !free.data?.length && (
            <p className="muted small">No free official releases found{genre ? ` for ${genre}` : ''} right now.</p>
          )}
          <Row title="Trending now" subtitle="What anime fans are watching this week" items={trending.data ?? []} loading={trending.loading} error={trending.error} onRetry={trending.reload} />
          <Row title={`This season · ${SEASON_LABEL[s]} ${year}`} subtitle="New and currently airing shows" items={season.data ?? []} loading={season.loading} error={season.error} onRetry={season.reload} />
          <Row title="All-time top rated" subtitle="The highest-scored anime on AniList" items={top.data ?? []} loading={top.loading} error={top.error} onRetry={top.reload} />
        </>
      )}
      <p className="small muted">Anime information from AniList.</p>
    </div>
  )
}
