import { useRef, type ReactNode } from 'react'
import type { MediaItem } from '../providers/types'
import { MediaCard } from './MediaCard'
import { Icon } from './Icon'

interface Props {
  title: ReactNode
  /** One plain-language line explaining what this row is. */
  subtitle?: ReactNode
  items: MediaItem[]
  loading?: boolean
  error?: Error
  onRetry?: () => void
  reasons?: Record<string, string>
  action?: ReactNode
}

export function ErrorNote({ error, onRetry, what }: { error?: Error; onRetry?: () => void; what?: string }) {
  if (!error) return null
  return (
    <div className="error-note" role="alert">
      <Icon name="alert" size={18} />
      <span>
        Couldn’t load {what ?? 'this'} right now. Check your connection and try again.
        <small>{error.message}</small>
      </span>
      {onRetry && (
        <button className="btn btn--small" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function Row({ title, subtitle, items, loading, error, onRetry, reasons, action }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  if (!loading && !items.length && !error) return null
  const scroll = (dir: number) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.85, behavior: 'smooth' })
  return (
    <section className="row" aria-busy={loading}>
      <header className="row__head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="row__sub">{subtitle}</p>}
        </div>
        <div className="row__actions">
          {action}
          {items.length > 4 && (
            <>
              <button className="icon-btn icon-btn--soft" onClick={() => scroll(-1)} aria-label="Scroll left">
                <Icon name="chevronLeft" size={18} />
              </button>
              <button className="icon-btn icon-btn--soft" onClick={() => scroll(1)} aria-label="Scroll right">
                <Icon name="chevronRight" size={18} />
              </button>
            </>
          )}
        </div>
      </header>
      {error && !items.length ? (
        <ErrorNote error={error} onRetry={onRetry} />
      ) : (
        <div className="row__scroller" ref={scroller}>
          {loading && !items.length
            ? Array.from({ length: 8 }, (_, i) => <div key={i} className="card card--skeleton" aria-hidden />)
            : items.map((it) => <MediaCard key={it.id} item={it} reason={reasons?.[it.id]} list={items} />)}
        </div>
      )}
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
