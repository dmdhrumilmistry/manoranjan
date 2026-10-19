# Manoranjan

An ad-free, tracker-free entertainment hub that runs entirely in the browser and is hosted for
free on GitHub Pages.

* 🎬 **Films & series**: public-domain classics from the Internet Archive and **your own Jellyfin library**.
* ▶️ **A proper player**:
  * Quality switching (HD / 1080p / 720p / Auto) and subtitles, including loading your own `.srt`/`.vtt` with size and sync controls.
  * Double-click or double-tap the sides to skip 10s, with a seek-bar time preview.
  * Speed, audio tracks, zoom-to-fill, picture-in-picture, resume, and an "Up next" episode countdown.
  * Keyboard shortcuts (press `?`). Your choices are remembered.
* 🍥 **Anime**: browse trending, seasonal and top-rated anime from AniList (no key). Shows the rights holders publish free on YouTube (Muse Asia, Ani-One and others) play right in the app, with watch-party sync. Everything else links to the services that stream it legally.
* 🎵 **Music**: full tracks from independent artists on Audius, with a queue, shuffle/repeat and lock-screen controls.
* ✨ **On-device recommendations**: computed from what you watch, finish, like and dislike. Nothing leaves your browser.
* 👥 **Watch & listen parties**: playback stays in sync across friends, with text chat and **WebRTC voice chat**. Peer-to-peer, with no accounts and no server.
* 📺 **Stream from your computer**: the host picks a local video/audio file (or shares a screen or tab) and it's live-streamed to everyone in the party.
* 🔗 **Play any link**: direct MP4/WebM/HLS URLs, synced in parties.
* 🛡️ **No ads, popups or trackers**: strict Content-Security-Policy, popup blocker, no third-party scripts, no referrers.
* 🔍 Optional **TMDB** key adds posters, trailers and legal "where to watch" links.

Manoranjan hosts no content and only uses legal sources. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.

## Host it on GitHub Pages (no command line)

1. **Fork** this repository (or push it to your own).
2. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Go to **Actions**, open **Deploy to GitHub Pages**, and click **Run workflow** (it also runs on every push to `main`).
4. Your site is live at `https://<you>.github.io/<repo>/`.
5. Open the site's **Settings** page to add an optional TMDB key or your Jellyfin server.

Hash-based routing and relative asset paths mean it works under any repo name with no config.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (recommender, sync)
npm run lint
npm run build      # production build in dist/ (CSP injected)
```

Node 22+.

## Jellyfin notes

* The server must be reachable over **HTTPS**, because browsers block mixed content from a GitHub Pages site.
* Create an API key under *Dashboard → API Keys*. Add your user ID to scope the library to that user.
* If the server is on another domain, make sure CORS allows your Pages origin (a reverse proxy can add `Access-Control-Allow-Origin`).

## Parties: how it connects

Peers find each other through public Nostr relays (signalling only), then connect directly over
WebRTC. If a friend is behind a strict corporate or mobile NAT and can't connect, add a TURN server
under *Settings → Party*. An optional room password encrypts the handshake.

Only stream content you have the right to share.

## License

[MIT](LICENSE)
