import { useToasts } from '../state/toast'
import { Icon } from './Icon'

export function Toasts() {
  const { toasts, dismiss } = useToasts()
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'sparkle'} size={16} />
          <span>{t.text}</span>
          <button className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
