import { useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useRoom } from '../state/room'
import { useSettings } from '../state/settings'
import { Icon } from '../components/Icon'

/** Invite-link landing page: confirm name (and optional password), then join. */
export default function Party() {
  const { roomId = '' } = useParams()
  const id = decodeURIComponent(roomId)
  const { openParty } = useOutletContext<{ openParty: () => void }>()
  const current = useRoom((s) => s.roomId)
  const join = useRoom((s) => s.join)
  const name = useSettings((s) => s.displayName)
  const set = useSettings((s) => s.set)
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (current === id) openParty()
  }, [current, id, openParty])

  if (current === id)
    return (
      <div className="empty">
        <h1>You’re in “{id}”</h1>
        <p className="muted">Pick anything to watch or listen to — everyone in the party follows along.</p>
        <div className="hero__actions">
          <Link className="btn btn--primary" to="/">Browse</Link>
          <Link className="btn" to="/music">Music</Link>
          <Link className="btn" to="/local">Stream my file</Link>
        </div>
      </div>
    )

  return (
    <div className="empty">
      <Icon name="users" size={40} />
      <h1>Join party “{id}”</h1>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          join(id, password)
        }}
      >
        <label>
          Your name
          <input value={name} maxLength={32} onChange={(e) => set({ displayName: e.target.value })} required />
        </label>
        <label>
          Room password <span className="muted">(if the host set one)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        </label>
        <button className="btn btn--primary btn--lg" type="submit">Join</button>
      </form>
    </div>
  )
}
