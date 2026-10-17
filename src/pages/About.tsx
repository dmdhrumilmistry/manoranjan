export default function About() {
  return (
    <div className="page prose">
      <h1>About Manoranjan</h1>
      <p>
        Manoranjan is an open-source, ad-free and tracker-free front-end for <em>legal</em> entertainment sources. It is a static web
        app: there is no backend, no account and no analytics. Your history, list and recommendations are computed and stored only in
        your browser.
      </p>
      <h2>Sources</h2>
      <ul>
        <li><strong>Internet Archive</strong> — public-domain and openly licensed films, TV and cartoons.</li>
        <li><strong>Jellyfin</strong> — your own media server, for media you own.</li>
        <li><strong>Audius</strong> — music published by artists on the open Audius network.</li>
        <li><strong>TMDB</strong> — metadata and artwork; this product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability by JustWatch.</li>
        <li><strong>Your files</strong> — played locally from your device; nothing is uploaded.</li>
      </ul>
      <h2>Parties</h2>
      <p>
        Watch parties, chat and voice use WebRTC directly between participants. Public Nostr relays are used only to help peers find
        each other (signalling). Media streamed from your device goes only to the people in your room. Only stream content you have
        the right to share.
      </p>
      <h2>License</h2>
      <p>MIT. Content belongs to its respective owners; Manoranjan hosts nothing.</p>
    </div>
  )
}
