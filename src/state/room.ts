import { create } from 'zustand'
import { joinRoom, selfId, type JsonValue, type Room } from 'trystero'
import { newer, tick, type PlaybackEvent } from '../lib/sync'
import { settings } from './settings'

/**
 * Serverless party rooms over WebRTC. Signalling goes through public Nostr
 * relays (Trystero), so the app stays a static site. All data and voice flow
 * peer-to-peer and are end-to-end encrypted by WebRTC (DTLS/SRTP); an optional
 * room password additionally encrypts the signalling handshake.
 */
const APP_ID = 'manoranjan-party-v1'
const MAX_CHAT = 300
const MAX_TEXT = 1000

export interface Peer {
  id: string
  name: string
  latencyMs: number
  /** Microphone audio. */
  stream?: MediaStream
  speaking?: boolean
  /** Live video/audio the peer is casting (e.g. a file from their computer, or a screen). */
  cast?: { stream: MediaStream; title: string }
}

export interface ChatMessage {
  id: string
  peerId: string
  name: string
  text: string
  at: number
  system?: boolean
}

type Wire = { [key: string]: JsonValue }

type Hello = {
  name: string
}

type ChatWire = {
  id: string
  text: string
}

interface RoomStore {
  roomId: string | null
  status: 'idle' | 'joining' | 'joined'
  peers: Record<string, Peer>
  messages: ChatMessage[]
  unread: number
  micOn: boolean
  selfSpeaking: boolean
  micError: string | null
  remote: { event: PlaybackEvent; receivedAt: number } | null
  last: PlaybackEvent | null
  clock: number
  join: (roomId: string, password?: string) => void
  leave: () => void
  say: (text: string) => void
  broadcast: (e: Omit<PlaybackEvent, 'clock' | 'peerId'>) => void
  toggleMic: () => Promise<void>
  /** Live-stream a local MediaStream (captured <video>, screen…) to everyone in the room. */
  startCast: (stream: MediaStream, title: string) => void
  stopCast: () => void
  casting: string | null
  markRead: () => void
}

// Non-serialisable runtime objects live outside the store.
let room: Room | null = null
let send: {
  hello?: (d: Hello, target?: string) => void
  chat?: (d: ChatWire) => void
  sync?: (d: PlaybackEvent, target?: string) => void
  castOff?: () => void
} = {}
let micStream: MediaStream | null = null
let castStream: { stream: MediaStream; title: string } | null = null
const castMeta = (title: string) => ({ type: 'cast', title: title.slice(0, 120) })
let pingTimer: ReturnType<typeof setInterval> | undefined
const meters = new Map<string, () => void>()

const uid = () => Math.random().toString(36).slice(2, 10)
// Strip control characters (incl. bidi overrides) that could spoof chat layout.
// eslint-disable-next-line no-control-regex
const sanitize = (s: string) => s.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, MAX_TEXT).trim()
const cleanName = (s: unknown) => sanitize(String(s ?? '')).slice(0, 32) || 'Guest'

/** Lightweight voice-activity indicator per stream. */
function watchSpeaking(id: string, stream: MediaStream, onChange: (v: boolean) => void) {
  meters.get(id)?.()
  try {
    const ctx = new AudioContext()
    const src = ctx.createMediaStreamSource(stream)
    const an = ctx.createAnalyser()
    an.fftSize = 512
    src.connect(an)
    const buf = new Uint8Array(an.frequencyBinCount)
    let prev = false
    const t = setInterval(() => {
      an.getByteFrequencyData(buf)
      const level = buf.reduce((a, b) => a + b, 0) / buf.length
      const now = level > 18
      if (now !== prev) onChange((prev = now))
    }, 150)
    meters.set(id, () => {
      clearInterval(t)
      void ctx.close()
    })
  } catch {
    /* AudioContext unavailable — indicator just stays off */
  }
}

export const useRoom = create<RoomStore>()((set, get) => {
  const system = (text: string) =>
    set((s) => ({
      messages: [...s.messages, { id: uid(), peerId: selfId, name: '', text, at: Date.now(), system: true }].slice(-MAX_CHAT),
    }))

  const patchPeer = (id: string, patch: Partial<Peer>) =>
    set((s) => {
      const existing = s.peers[id] ?? { id, name: 'Guest', latencyMs: 50 }
      return { peers: { ...s.peers, [id]: { ...existing, ...patch } } }
    })

  return {
    roomId: null,
    status: 'idle',
    peers: {},
    messages: [],
    unread: 0,
    micOn: false,
    selfSpeaking: false,
    micError: null,
    remote: null,
    last: null,
    clock: 0,

    join(roomId, password) {
      if (get().roomId === roomId) return
      get().leave()
      const s = settings()
      const rtcConfig: RTCConfiguration | undefined = s.turnUrl
        ? {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: s.turnUrl, username: s.turnUser, credential: s.turnPass },
            ],
          }
        : undefined
      room = joinRoom({ appId: APP_ID, password: password || undefined, rtcConfig }, roomId)
      set({ roomId, status: 'joined', peers: {}, messages: [], remote: null, last: null, clock: 0 })
      system(`You joined room “${roomId}”. Share the invite link to watch together.`)

      // Payloads are typed as JSON on the wire and re-validated on receipt.
      const hello = room.makeAction<Wire>('hello')
      const chat = room.makeAction<Wire>('chat')
      const sync = room.makeAction<Wire>('sync')
      const castOff = room.makeAction<Wire>('castoff')
      const opts = (target?: string) => (target ? { target } : undefined)
      send = {
        hello: (d, target) => void hello.send(d as Wire, opts(target)),
        chat: (d) => void chat.send(d as Wire),
        sync: (d, target) => void sync.send(d as unknown as Wire, opts(target)),
        castOff: () => void castOff.send({}),
      }
      castOff.onMessage = (_, { peerId }) => patchPeer(peerId, { cast: undefined })

      room.onPeerJoin = (id) => {
        patchPeer(id, {})
        send.hello?.({ name: settings().displayName }, id)
        // Late joiners immediately receive what we're playing.
        const last = get().last
        if (last) send.sync?.(last, id)
        if (micStream) room?.addStream(micStream, { target: id, metadata: { type: 'voice' } })
        if (castStream) room?.addStream(castStream.stream, { target: id, metadata: castMeta(castStream.title) })
      }
      room.onPeerLeave = (id) => {
        const name = get().peers[id]?.name ?? 'Someone'
        meters.get(id)?.()
        meters.delete(id)
        set((st) => {
          const peers = { ...st.peers }
          delete peers[id]
          return { peers }
        })
        system(`${name} left`)
      }
      room.onPeerStream = (stream, id, metadata) => {
        const meta = (metadata ?? {}) as { type?: string; title?: string }
        if (meta.type === 'cast') {
          const title = cleanName(meta.title)
          patchPeer(id, { cast: { stream, title } })
          system(`${get().peers[id]?.name ?? 'Someone'} started streaming “${title}”`)
          // Drop the cast when the sender stops it.
          stream.addEventListener('removetrack', () => {
            if (stream.getTracks().length === 0) patchPeer(id, { cast: undefined })
          })
          return
        }
        patchPeer(id, { stream })
        watchSpeaking(id, stream, (speaking) => patchPeer(id, { speaking }))
      }

      hello.onMessage = (raw, { peerId }) => {
        const d = raw as Partial<Hello> | null
        const known = get().peers[peerId]?.name
        patchPeer(peerId, { name: cleanName(d?.name) })
        if (!known || known === 'Guest') system(`${cleanName(d?.name)} joined`)
      }
      chat.onMessage = (raw, { peerId }) => {
        const d = raw as Partial<ChatWire> | null
        const text = sanitize(String(d?.text ?? ''))
        if (!text) return
        const name = get().peers[peerId]?.name ?? 'Guest'
        set((st) => ({
          messages: [...st.messages, { id: String(d?.id ?? uid()).slice(0, 16), peerId, name, text, at: Date.now() }].slice(-MAX_CHAT),
          unread: st.unread + 1,
        }))
      }
      sync.onMessage = (raw, { peerId }) => {
        const e = raw as unknown as PlaybackEvent | null
        if (!e || typeof e.position !== 'number' || typeof e.clock !== 'number' || !e.media?.id) return
        const event = { ...e, peerId } // never trust a claimed sender id
        set((st) => ({ clock: tick(st.clock, event.clock) }))
        if (!newer(event, get().last)) return
        set({ last: event, remote: { event, receivedAt: performance.now() } })
      }

      pingTimer = setInterval(() => {
        for (const id of Object.keys(get().peers))
          room
            ?.ping(id)
            .then((rtt) => patchPeer(id, { latencyMs: rtt / 2 }))
            .catch(() => {})
      }, 5000)
    },

    leave() {
      if (!room) return
      clearInterval(pingTimer)
      micStream?.getTracks().forEach((t) => t.stop())
      micStream = null
      castStream = null
      meters.forEach((stop) => stop())
      meters.clear()
      void room.leave()
      room = null
      send = {}
      set({ roomId: null, status: 'idle', peers: {}, micOn: false, selfSpeaking: false, casting: null, remote: null, last: null, unread: 0 })
    },

    say(raw) {
      const text = sanitize(raw)
      if (!text || !room) return
      const id = uid()
      send.chat?.({ id, text })
      set((s) => ({
        messages: [...s.messages, { id, peerId: selfId, name: settings().displayName, text, at: Date.now() }].slice(-MAX_CHAT),
      }))
    },

    broadcast(partial) {
      if (!room) return
      const clock = tick(get().clock)
      const event: PlaybackEvent = { ...partial, clock, peerId: selfId }
      set({ clock, last: event })
      send.sync?.(event)
    },

    async toggleMic() {
      if (!room) return
      if (micStream) {
        room.removeStream(micStream)
        micStream.getTracks().forEach((t) => t.stop())
        micStream = null
        meters.get(selfId)?.()
        meters.delete(selfId)
        set({ micOn: false, selfSpeaking: false })
        return
      }
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
        room.addStream(micStream, { metadata: { type: 'voice' } })
        watchSpeaking(selfId, micStream, (selfSpeaking) => set({ selfSpeaking }))
        set({ micOn: true, micError: null })
      } catch (e) {
        set({ micError: e instanceof Error ? e.message : 'Microphone unavailable' })
      }
    },

    startCast(stream, title) {
      if (!room) return
      get().stopCast()
      castStream = { stream, title }
      room.addStream(stream, { metadata: castMeta(title) })
      send.chat?.({ id: uid(), text: `📺 Streaming “${title.slice(0, 120)}” — open the party panel to watch.` })
      set({ casting: title })
    },

    stopCast() {
      if (castStream && room) {
        room.removeStream(castStream.stream)
        send.castOff?.()
      }
      castStream = null
      set({ casting: null })
    },

    casting: null,

    markRead: () => set({ unread: 0 }),
  }
})

export { selfId }
