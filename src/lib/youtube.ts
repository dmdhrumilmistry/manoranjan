/**
 * YouTube helpers. Videos play in the privacy-enhanced youtube-nocookie.com
 * embed. No YouTube API script is loaded (CSP allows only our own scripts);
 * instead we speak the embed's postMessage protocol directly.
 */

export interface YouTubeRef {
  videoId?: string
  playlistId?: string
}

const ID = /^[\w-]{6,64}$/

/** Extract a video and/or playlist id from any common YouTube URL form. */
export function parseYouTube(raw: string): YouTubeRef | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '')
  let videoId: string | undefined
  if (host === 'youtu.be') videoId = u.pathname.slice(1).split('/')[0]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') videoId = u.searchParams.get('v') ?? undefined
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]+)/)
      if (m && m[1] !== 'videoseries') videoId = m[1]
    }
  } else return null
  const playlistId = u.searchParams.get('list') ?? undefined
  const ref: YouTubeRef = {}
  if (videoId && ID.test(videoId)) ref.videoId = videoId
  if (playlistId && ID.test(playlistId)) ref.playlistId = playlistId
  return ref.videoId || ref.playlistId ? ref : null
}

export const YT_ORIGIN = 'https://www.youtube-nocookie.com'

export function embedUrl(ref: YouTubeRef, origin = location.origin): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    origin,
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    iv_load_policy: '3',
  })
  if (ref.playlistId) params.set('list', ref.playlistId)
  const path = ref.videoId ? encodeURIComponent(ref.videoId) : 'videoseries'
  return `${YT_ORIGIN}/embed/${path}?${params}`
}

export const ytThumb = (videoId: string) => `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`

/** YouTube player states from the embed protocol. */
const PLAYING = 1
const BUFFERING = 3

/**
 * Presents a YouTube iframe as a minimal HTMLMediaElement (currentTime,
 * paused, play/pause, playbackRate, and play/pause/seeked/timeupdate events)
 * so the party-sync hook can drive it exactly like a <video>.
 */
export class YouTubeBridge extends EventTarget {
  private time = 0
  private at = performance.now()
  private state = -1
  private rate = 1
  private ready = false
  private expectSeekUntil = 0
  private handshake: ReturnType<typeof setInterval> | undefined
  duration = 0

  constructor(private iframe: HTMLIFrameElement) {
    super()
    window.addEventListener('message', this.onMessage)
    // The embed only starts reporting after it hears "listening"; repeat until it answers.
    const hello = () => this.send({ event: 'listening', id: 1, channel: 'widget' })
    iframe.addEventListener('load', hello)
    this.handshake = setInterval(() => (this.ready ? clearInterval(this.handshake) : hello()), 400)
  }

  destroy() {
    clearInterval(this.handshake)
    window.removeEventListener('message', this.onMessage)
  }

  private send(msg: object) {
    this.iframe.contentWindow?.postMessage(JSON.stringify(msg), YT_ORIGIN)
  }

  private command(func: string, args: unknown[] = []) {
    this.send({ event: 'command', func, args, id: 1, channel: 'widget' })
  }

  private onMessage = (e: MessageEvent) => {
    if (e.source !== this.iframe.contentWindow || !/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return
    let data: { event?: string; info?: Record<string, unknown> | number }
    try {
      data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
    } catch {
      return
    }
    if (data.event === 'onReady' || data.event === 'initialDelivery') this.ready = true
    if (data.event === 'onStateChange' && typeof data.info === 'number') this.setState(data.info)
    if ((data.event === 'infoDelivery' || data.event === 'initialDelivery') && data.info && typeof data.info === 'object') {
      this.ready = true
      const info = data.info
      if (typeof info.duration === 'number' && info.duration > 0) this.duration = info.duration
      if (typeof info.playbackRate === 'number') this.rate = info.playbackRate
      if (typeof info.currentTime === 'number') {
        const predicted = this.currentTime
        this.time = info.currentTime
        this.at = performance.now()
        // A jump the user made inside YouTube's own controls.
        if (Math.abs(info.currentTime - predicted) > 2 && performance.now() > this.expectSeekUntil) this.emit('seeked')
        this.emit('timeupdate')
      }
      if (typeof info.playerState === 'number') this.setState(info.playerState)
    }
  }

  private setState(s: number) {
    if (s === this.state) return
    const wasPlaying = !this.paused
    this.state = s
    if (s === 0) this.emit('ended')
    if (!wasPlaying && !this.paused) this.emit('play')
    if (wasPlaying && this.paused && s !== 0) this.emit('pause')
  }

  private emit(type: string) {
    this.dispatchEvent(new Event(type))
  }

  get currentTime() {
    const moving = this.state === PLAYING
    return this.time + (moving ? ((performance.now() - this.at) / 1000) * this.rate : 0)
  }
  set currentTime(t: number) {
    this.time = t
    this.at = performance.now()
    this.expectSeekUntil = performance.now() + 1500
    this.command('seekTo', [t, true])
  }
  get paused() {
    return this.state !== PLAYING && this.state !== BUFFERING
  }
  get playbackRate() {
    return this.rate
  }
  set playbackRate(r: number) {
    // YouTube only supports fixed steps; tiny drift nudges are ignored rather than rounded to 1.
    if (Math.abs(r - this.rate) < 0.1) return
    this.rate = r
    this.command('setPlaybackRate', [r])
  }
  play() {
    this.command('playVideo')
    return Promise.resolve()
  }
  pause() {
    this.command('pauseVideo')
  }
}
