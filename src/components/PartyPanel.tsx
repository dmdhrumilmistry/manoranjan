import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { selfId, useRoom, type Peer } from '../state/room'
import { useSettings } from '../state/settings'
import { Icon } from './Icon'

const randomRoom = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')

export const inviteLink = (roomId: string) => `${location.origin}${location.pathname}#/party/${encodeURIComponent(roomId)}`

/** Plays a MediaStream in a hidden/visible element. */
function StreamMedia({ stream, video, muted }: { stream: MediaStream; video?: boolean; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.srcObject = stream
    void ref.current.play().catch(() => {})
  }, [stream])
  return video ? (
    <video ref={ref} className="cast__video" autoPlay playsInline controls muted={muted} />
  ) : (
    <audio ref={ref} autoPlay hidden />
  )
}

function PeerChip({ peer }: { peer: Peer }) {
  return (
    <li className={`peer ${peer.speaking ? 'peer--speaking' : ''}`} title={`${Math.round(peer.latencyMs * 2)} ms round-trip`}>
      <span className="peer__avatar" aria-hidden>
        {peer.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="peer__name">{peer.name}</span>
      {peer.stream && <Icon name="mic" size={14} label="Voice on" />}
      {peer.cast && <Icon name="screen" size={14} label="Streaming" />}
    </li>
  )
}

export function PartyPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const r = useRoom()
  const name = useSettings((s) => s.displayName)
  const setSettings = useSettings((s) => s.set)
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [joinId, setJoinId] = useState('')
  const [password, setPassword] = useState('')
  const [copied, setCopied] = useState(false)
  const chatEnd = useRef<HTMLDivElement>(null)
  const peers = useMemo(() => Object.values(r.peers), [r.peers])
  const casts = peers.filter((p) => p.cast)

  const { markRead } = r
  const messageCount = r.messages.length
  const hasUnread = r.unread > 0
  useEffect(() => {
    if (open && hasUnread) markRead()
  }, [open, hasUnread, markRead])
  useEffect(() => {
    if (open) chatEnd.current?.scrollIntoView({ block: 'end' })
  }, [open, messageCount])

  const copyInvite = async () => {
    if (!r.roomId) return
    try {
      await navigator.clipboard.writeText(inviteLink(r.roomId))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — link is visible to copy manually */
    }
  }

  return (
    <>
      {/* Voice + casts must keep playing even when the panel is closed. */}
      <div hidden>
        {peers.map((p) => p.stream && <StreamMedia key={p.id} stream={p.stream} />)}
      </div>

      <aside className={`party ${open ? 'party--open' : ''}`} aria-label="Watch party" aria-hidden={!open}>
        <header className="party__head">
          <h2>
            <Icon name="users" /> Watch party
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close party panel">
            <Icon name="close" />
          </button>
        </header>

        {!r.roomId ? (
          <div className="party__join">
            <p className="muted">
              Watch or listen in sync with friends, chat and talk — peer-to-peer, no accounts, no servers storing anything.
            </p>
            <label>
              Your name
              <input value={name} maxLength={32} onChange={(e) => setSettings({ displayName: e.target.value })} />
            </label>
            <button
              className="btn btn--primary"
              onClick={() => {
                const id = randomRoom()
                r.join(id, password)
                navigate(`/party/${id}`, { replace: false })
              }}
            >
              Start a new party
            </button>
            <div className="divider">or join one</div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const id = joinId.trim().replace(/^.*#\/party\//, '')
                if (id) r.join(decodeURIComponent(id), password)
              }}
            >
              <input placeholder="Room code or invite link" value={joinId} onChange={(e) => setJoinId(e.target.value)} />
              <input
                type="password"
                placeholder="Room password (optional)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
              <button className="btn" type="submit">
                Join
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="party__room">
              <code title="Room code">{r.roomId}</code>
              <button className="btn btn--small" onClick={copyInvite}>
                <Icon name="link" size={16} /> {copied ? 'Copied!' : 'Invite'}
              </button>
              <button className="btn btn--small btn--ghost" onClick={r.leave}>
                Leave
              </button>
            </div>

            <ul className="peers" aria-label="People in room">
              <li className={`peer peer--self ${r.selfSpeaking ? 'peer--speaking' : ''}`}>
                <span className="peer__avatar" aria-hidden>
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <span className="peer__name">{name} (you)</span>
              </li>
              {peers.map((p) => (
                <PeerChip key={p.id} peer={p} />
              ))}
              {!peers.length && <li className="muted small">Waiting for friends… share the invite link.</li>}
            </ul>

            <div className="party__voice">
              <button className={`btn ${r.micOn ? 'btn--danger' : ''}`} onClick={() => void r.toggleMic()} aria-pressed={r.micOn}>
                <Icon name={r.micOn ? 'micOff' : 'mic'} size={18} /> {r.micOn ? 'Leave voice' : 'Join voice'}
              </button>
              {r.casting && (
                <button className="btn btn--small btn--ghost" onClick={r.stopCast}>
                  Stop streaming “{r.casting}”
                </button>
              )}
              {r.micError && <p className="error small">{r.micError}</p>}
            </div>

            {casts.map((p) => (
              <figure className="cast" key={p.id}>
                <StreamMedia stream={p.cast!.stream} video />
                <figcaption>
                  {p.name} is streaming “{p.cast!.title}”
                </figcaption>
              </figure>
            ))}

            <div className="chat" role="log" aria-live="polite" aria-label="Chat">
              {r.messages.map((m) =>
                m.system ? (
                  <div key={m.id} className="chat__system">
                    {m.text}
                  </div>
                ) : (
                  <div key={m.id} className={`chat__msg ${m.peerId === selfId ? 'chat__msg--self' : ''}`}>
                    <span className="chat__name">{m.peerId === selfId ? 'You' : m.name}</span>
                    <span className="chat__text">{m.text}</span>
                  </div>
                ),
              )}
              <div ref={chatEnd} />
            </div>
            <form
              className="chat__form"
              onSubmit={(e) => {
                e.preventDefault()
                r.say(draft)
                setDraft('')
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Say something…"
                maxLength={1000}
                aria-label="Chat message"
              />
              <button className="icon-btn icon-btn--primary" type="submit" aria-label="Send" disabled={!draft.trim()}>
                <Icon name="send" size={18} />
              </button>
            </form>
          </>
        )}
      </aside>
    </>
  )
}
