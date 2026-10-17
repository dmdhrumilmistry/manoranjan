import { useMemo, useState } from 'react'
import { Grid } from '../components/Row'
import { useRecommendations, useTrending } from '../hooks/useCatalog'

export default function Browse({ kind }: { kind: 'movie' | 'series' }) {
  const { data = [], loading, error } = useTrending(kind)
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
        <h1>{kind === 'movie' ? 'Films' : 'Series'}</h1>
        <label className="select">
          <span className="sr-only">Sort</span>
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
      {error && <p className="notice">{error.message}</p>}
      <Grid items={items} loading={loading} />
    </div>
  )
}
