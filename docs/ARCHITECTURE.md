# Architecture & plan

## Goals

| Goal | How |
| --- | --- |
| No ads, popups or trackers | Only ad-free, legal APIs; strict CSP (`script-src 'self'`, framing limited to `youtube-nocookie.com`); runtime popup blocker; `no-referrer` everywhere; no analytics, cookies or third-party scripts |
| Movies & series without downloading | Progressive MP4 / HLS streaming in a custom player (hls.js lazy-loaded) |
| On-device recommendations | Content-based TF-IDF + cosine similarity over tags, with time decay and a diversity re-rank (`src/lib/recommender.ts`) |
| Music | Audius public API, a persistent queue player, Media Session integration |
| Watch / listen together, chat, voice | WebRTC mesh via Trystero (Nostr relays for signalling only), Lamport-clock playback sync, DTLS-encrypted data channels, SRTP voice |
| Host streams a local file | `HTMLMediaElement.captureStream()` → WebRTC media track to every peer; screen/tab share via `getDisplayMedia` |
| Static hosting, set up from the UI | Vite build, relative base + hash routing, GitHub Actions → Pages; every setting is entered in the app |

## Sources

| Provider | What | Auth | Streams? |
| --- | --- | --- | --- |
| Internet Archive | Public-domain films, classic TV, cartoons | none | yes (MP4) |
| Jellyfin | Your own server | API key | yes (direct / HLS transcode) |
| TMDB | Metadata, trailers, JustWatch "where to watch" | free key | no: links out to licensed services |
| AniList | Anime catalogue and official streaming links | none | official free YouTube releases only (privacy-enhanced embed) |
| Audius | Independent music | none | yes |
| Local files / URL | Anything you have the right to play | - | yes |

Providers implement `VideoProvider` (`src/providers/types.ts`) and are queried in parallel with
`Promise.allSettled`, so one source failing never blanks a page. To add a source, implement the
interface and register it in `src/providers/index.ts`.

## Layout

```
src/
  providers/   one module per source + shared types
  lib/         pure logic: recommender, sync, http, shield (unit-tested)
  state/       zustand stores: settings, library (history/progress/pool), player, room
  hooks/       usePartySync (media ⇄ room), useCatalog, useAsync
  components/  VideoPlayer, MusicBar, PartyPanel, cards/rows, layout
  pages/       route-level, lazy-loaded
```

## YouTube embeds

Official free releases play in `youtube-nocookie.com` embeds. No YouTube script is loaded, because the CSP allows only
our own scripts. Instead, `YouTubeBridge` (`src/lib/youtube.ts`) speaks the embed's postMessage protocol and exposes a
minimal media-element interface. That way the same party-sync hook and progress tracking work for YouTube as for the
built-in player. The iframe is sandboxed without `allow-popups`.

## Party sync protocol

* Each user action (play, pause, seek, speed, new media) is a `PlaybackEvent`
  `{media, playing, position, rate, clock, peerId}`.
* Peers keep the event with the greatest `(clock, peerId)`: a deterministic last-writer-wins
  that converges without a host or server.
* Receivers extrapolate `position` by elapsed time plus half the measured RTT. Drift under
  0.25 s is ignored, drift up to 2 s is nudged with a ±5 % playback rate, and anything larger
  triggers a seek.
* Late joiners get the latest event as soon as they connect. New media makes peers navigate
  to it (video) or load it into the queue (music).
* The sender id is always taken from the transport, never from the payload. Chat text is
  length-limited and stripped of control and bidi characters, and it is rendered as text,
  never as HTML.

## Privacy

Everything personal (history, list, progress, keys) lives in `localStorage` on the device.
Backups exclude secrets. Signalling relays see a hashed room topic and connection offers (encrypted
when a room password is set); media, chat and voice go peer-to-peer over DTLS/SRTP.
