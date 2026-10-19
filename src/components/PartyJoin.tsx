import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRoom } from '../state/room'
import { useSettings } from '../state/settings'
import { toast } from '../state/toast'
import { Icon } from './Icon'

const randomRoom = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')

export const inviteLink = (roomId: string) => `${location.origin}${location.pathname}#/party/${encodeURIComponent(roomId)}`

/** Share sheet on phones, clipboard elsewhere. */
export async function shareInvite(roomId: string) {
  const url = inviteLink(roomId)
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: 'Watch with me on Manoranjan', url })
      return
    }
    await navigator.clipboard.writeText(url)
    toast('Invite link copied. Send it to your friends.', 'success')
  } catch {
    toast(`Copy this link: ${url}`)
  }
}

export const PARTY_STEPS = [
  { title: 'Start a party', text: 'You get a private room with its own link.' },
  { title: 'Invite friends', text: 'Send them the link. They join from any browser, no account needed.' },
  { title: 'Press play', text: 'Pick anything. Play, pause and skips stay in sync for everyone.' },
]

export function PartySteps() {
  return (
    <ol className="steps">
      {PARTY_STEPS.map((s, i) => (
        <li key={s.title}>
          <span className="steps__num">{i + 1}</span>
          <div>
            <strong>{s.title}</strong>
            <p>{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Name + start-new / join-existing. Used by the side panel and the /party page. */
export function PartyJoin({ initialRoom = '' }: { initialRoom?: string }) {
  const join = useRoom((s) => s.join)
  const name = useSettings((s) => s.displayName)
  const set = useSettings((s) => s.set)
  const navigate = useNavigate()
  const [code, setCode] = useState(initialRoom)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const start = () => {
    const id = randomRoom()
    join(id, password)
    navigate(`/party/${id}`)
    toast('Party started. Now invite your friends.', 'success')
  }

  return (
    <div className="party-join">
      <label className="field">
        <span className="field__label">Your name</span>
        <input value={name} maxLength={32} onChange={(e) => set({ displayName: e.target.value })} placeholder="How friends will see you" />
      </label>

      {showPassword ? (
        <label className="field">
          <span className="field__label">Room password (optional)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" placeholder="Everyone must enter the same one" />
        </label>
      ) : (
        <button className="linklike" onClick={() => setShowPassword(true)}>
          <Icon name="shield" size={14} /> Add a room password
        </button>
      )}

      {!initialRoom && (
        <button className="btn btn--primary btn--block" onClick={start}>
          <Icon name="plus" size={18} /> Start a new party
        </button>
      )}

      <form
        className="party-join__join"
        onSubmit={(e) => {
          e.preventDefault()
          const id = decodeURIComponent(code.trim().replace(/^.*#\/party\//, ''))
          if (!id) return
          join(id, password)
          navigate(`/party/${encodeURIComponent(id)}`)
        }}
      >
        {!initialRoom && <div className="divider">or join a friend’s party</div>}
        <div className="inline-form">
          {!initialRoom && (
            <input placeholder="Paste invite link or room code" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Invite link or room code" />
          )}
          <button className={`btn ${initialRoom ? 'btn--primary btn--block' : ''}`} type="submit" disabled={!code.trim()}>
            {initialRoom ? 'Join party' : 'Join'}
          </button>
        </div>
      </form>
    </div>
  )
}
