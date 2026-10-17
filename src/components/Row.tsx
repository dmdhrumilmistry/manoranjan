import { useRef, type ReactNode } from 'react'
import type { MediaItem } from '../providers/types'
import { MediaCard } from './MediaCard'

interface Props {
  title: ReactNode
  items: MediaItem[]
  loading?: boolean
  reasons?: Record<string, string>
  action?: ReactNode
}

export function Row({ title, items, loading, reasons, action }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  if (!loading && !items.length) return null
  const scroll = (dir: number) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.85, behavior: 'smooth' })
  return (
    <section className="row" aria-busy={loading}>
      <header className="row__head">
        <h2>{title}</h2>
        <div className="row__actions">
          {action}
          <button className="icon-btn" onClick={() => scroll(-1)} aria-label="Scroll left">
            ‹
          </button>
          <button className="icon-btn" onClick={() => scroll(1)} aria-label="Scroll right">
            ›
          </button>
        </div>
      </header>
      <div className="row__scroller" ref={scroller}>
        {loading && !items.length
          ? Array.from({ length: 8 }, (_, i) => <div key={i} className="card card--skeleton" aria-hidden />)
          : items.map((it) => <MediaCard key={it.id} item={it} reason={reasons?.[it.id]} list={items} />)}
      </div>
    </section>
  )
}

export function Grid({ items, loading }: { items: MediaItem[]; loading?: boolean }) {
  return (
    <div className="grid" aria-busy={loading}>
      {loading && !items.length
        ? Array.from({ length: 12 }, (_, i) => <div key={i} className="card card--skeleton" aria-hidden />)
        : items.map((it) => <MediaCard key={it.id} item={it} list={items} />)}
    </div>
  )
}
