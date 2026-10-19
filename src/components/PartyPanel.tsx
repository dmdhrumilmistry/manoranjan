import { useEffect, useMemo, useRef, useState } from 'react'
import { selfId, useRoom, type Peer } from '../state/room'
import { useSettings } from '../state/settings'
import { Icon } from './Icon'
import { PartyJoin, PartySteps, shareInvite } from './PartyJoin'
import { toast } from '../state/toast'


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
  const [draft, setDraft] = useState('')
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
          <div className="party__intro">
            <p className="muted">Watch or listen in sync with friends, and chat or talk while you do. It's private and peer-to-peer.</p>
            <PartySteps />
            <PartyJoin />
          </div>
        ) : (
          <>
            <div className="party__room">
              <div>
                <span className="party__label">Room</span>
                <code title="Room code">{r.roomId}</code>
              </div>
              <button className="btn btn--small btn--primary" onClick={() => void shareInvite(r.roomId!)}>
                <Icon name="link" size={16} /> Invite friends
              </button>
              <button className="btn btn--small btn--ghost" onClick={() => { r.leave(); toast('You left the party') }}>
                Leave
              </button>
            </div>
            {!peers.length && (
              <p className="party__hint">
                <Icon name="info" size={14} /> Nobody else is here yet. Tap <strong>Invite friends</strong> and send them the link. Anything you
                play will then play for everyone.
              </p>
            )}

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
            </ul>

            <div className="party__voice">
              <button className={`btn ${r.micOn ? 'btn--danger' : ''}`} onClick={() => void r.toggleMic()} aria-pressed={r.micOn}>
                <Icon name={r.micOn ? 'micOff' : 'mic'} size={18} /> {r.micOn ? 'Turn off mic' : 'Talk (voice chat)'}
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
                placeholder="Message everyone…"
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
