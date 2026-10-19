import { useMemo, useState } from 'react'
import { ErrorNote, Grid } from '../components/Row'
import { useRecommendations, useTrending } from '../hooks/useCatalog'

export default function Browse({ kind }: { kind: 'movie' | 'series' }) {
  const { data = [], loading, error, reload } = useTrending(kind)
  const recs = useRecommendations(kind)
  const [tag, setTag] = useState<string | null>(null)
  const [sort, setSort] = useState<'trending' | 'foryou' | 'newest' | 'az'>('trending')

  const tags = useMemo(() => {
    const count = new Map<string, number>()
    for (const i of data) for (const t of i.tags) if (!t.includes(':')) count.set(t, (count.get(t) ?? 0) + 1)
    return [...count.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([t]) => t)
  }, [data])

  const items = useMemo(() => {
    let list = tag ? data.filter((i) => i.tags.includes(tag)) : data
    if (sort === 'foryou') {
      const rank = new Map(recs.items.map((r, i) => [r.id, i]))
      list = [...list].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9))
    } else if (sort === 'newest') list = [...list].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    else if (sort === 'az') list = [...list].sort((a, b) => a.title.localeCompare(b.title))
    return list
  }, [data, tag, sort, recs.items])

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>{kind === 'movie' ? 'Movies' : 'TV Shows'}</h1>
          <p className="muted">
            {kind === 'movie'
              ? 'Free public-domain films, plus anything in your connected library.'
              : 'Classic TV episodes and cartoons, plus shows from your library.'}
          </p>
        </div>
        <label className="select">
          <span className="select__label">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="trending">Trending</option>
            <option value="foryou">For you</option>
            <option value="newest">Newest</option>
            <option value="az">A–Z</option>
          </select>
        </label>
      </header>
      {tags.length > 0 && (
        <div className="chips" role="toolbar" aria-label="Filter by genre">
          <button className="chip" aria-pressed={!tag} onClick={() => setTag(null)}>
            All
          </button>
          {tags.map((t) => (
            <button key={t} className="chip" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      <ErrorNote error={error} onRetry={reload} what={kind === 'movie' ? 'movies' : 'TV shows'} />
      {!loading && !error && !items.length ? (
        <div className="empty empty--inline">
          <p>Nothing matches this filter.</p>
          <button className="btn" onClick={() => setTag(null)}>Show everything</button>
        </div>
      ) : (
        <Grid items={items} loading={loading} />
      )}
    </div>
  )
}
