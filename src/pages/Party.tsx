import { useEffect } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useRoom } from '../state/room'
import { Icon } from '../components/Icon'
import { PartyJoin, PartySteps, shareInvite } from '../components/PartyJoin'

/** /party explains and starts parties; /party/:roomId is the invite-link landing page. */
export default function Party() {
  const { roomId = '' } = useParams()
  const id = decodeURIComponent(roomId)
  const { openParty } = useOutletContext<{ openParty: () => void }>()
  const current = useRoom((s) => s.roomId)
  const peers = useRoom((s) => Object.keys(s.peers).length)

  useEffect(() => {
    if (current && current === id) openParty()
  }, [current, id, openParty])

  if (current && (current === id || !id))
    return (
      <div className="page page--narrow party-page">
        <span className="pill">
          <span className="live-dot" /> You’re in a party · {peers + 1} {peers ? 'people' : 'person'}
        </span>
        <h1>Now pick something to watch</h1>
        <p className="muted">Whatever you play now plays for everyone in the room, in sync. Chat and voice are in the side panel.</p>
        <div className="party-page__actions">
          <button className="btn btn--primary" onClick={() => void shareInvite(current)}>
            <Icon name="link" size={18} /> Invite friends
          </button>
          <Link className="btn" to="/movies">
            <Icon name="film" size={18} /> Movies
          </Link>
          <Link className="btn" to="/music">
            <Icon name="music" size={18} /> Music
          </Link>
          <Link className="btn" to="/local">
            <Icon name="upload" size={18} /> Stream a file from my device
          </Link>
        </div>
      </div>
    )

  return (
    <div className="page page--narrow party-page">
      <Icon name="users" size={40} />
      <h1>{id ? 'You’re invited to a watch party' : 'Watch together'}</h1>
      <p className="muted">
        {id
          ? 'Enter your name and join. You’ll see and hear what the others are watching, in sync.'
          : 'Watch movies or listen to music in sync with friends anywhere, with chat and voice. No accounts, and nothing is stored on a server.'}
      </p>
      {!id && <PartySteps />}
      <div className="card-section">
        <PartyJoin initialRoom={id} />
      </div>
    </div>
  )
}
