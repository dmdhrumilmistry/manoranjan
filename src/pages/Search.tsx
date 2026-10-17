import { useSearchParams } from 'react-router-dom'
import { Grid } from '../components/Row'
import { useAsync } from '../hooks/useAsync'
import { fanOut } from '../providers'
import { audius } from '../providers/audius'
import { useLibrary } from '../state/library'
import { TrackList } from './Music'
import { useEffect } from 'react'

export default function Search() {
  const [params] = useSearchParams()
  const q = params.get('q')?.trim() ?? ''
  const addToPool = useLibrary((s) => s.addToPool)
  const video = useAsync(() => (q ? fanOut((p) => p.search(q)) : Promise.resolve({ items: [], errors: [] })), [q])
  const music = useAsync(() => (q ? audius.search(q).catch(() => []) : Promise.resolve([])), [q])

  useEffect(() => {
    if (video.data?.items.length) addToPool(video.data.items)
    if (music.data?.length) addToPool(music.data)
  }, [video.data, music.data, addToPool])

  return (
    <div className="page">
      <header className="page__head">
        <h1>Results for “{q}”</h1>
      </header>
      {video.data?.errors.map((e) => (
        <p key={e.provider} className="notice small">
          {e.provider}: {e.message}
        </p>
      ))}
      <h2>Films &amp; series</h2>
      {!video.loading && !video.data?.items.length ? <p className="muted">No titles found.</p> : <Grid items={video.data?.items ?? []} loading={video.loading} />}
      <h2>Music</h2>
      {music.loading ? <p className="muted">Searching…</p> : music.data?.length ? <TrackList items={music.data} /> : <p className="muted">No tracks found.</p>}
    </div>
  )
}
