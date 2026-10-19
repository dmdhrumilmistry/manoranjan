import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useRoom } from '../state/room'
import { useSettings } from '../state/settings'
import { usePlayer } from '../state/player'
import { Icon, type IconName } from './Icon'
import { MusicBar } from './MusicBar'
import { PartyPanel } from './PartyPanel'
import { PartyFollower } from './PartyFollower'
import { Toasts } from './Toasts'

const NAV: { to: string; label: string; icon: IconName; hint: string }[] = [
  { to: '/', label: 'Home', icon: 'home', hint: 'Recommendations and what’s trending' },
  { to: '/movies', label: 'Movies', icon: 'film', hint: 'Free classic films' },
  { to: '/series', label: 'TV Shows', icon: 'tv', hint: 'Classic TV and cartoons' },
  { to: '/anime', label: 'Anime', icon: 'star', hint: 'Anime: free official releases and where to watch the rest' },
  { to: '/music', label: 'Music', icon: 'music', hint: 'Free music from independent artists' },
  { to: '/local', label: 'My Files', icon: 'upload', hint: 'Play videos from your device' },
]

export function Layout() {
  const [partyOpen, setPartyOpen] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const inRoom = useRoom((s) => !!s.roomId)
  const peers = useRoom((s) => Object.keys(s.peers).length)
  const unread = useRoom((s) => s.unread)
  const theme = useSettings((s) => s.theme)
  const hasTrack = usePlayer((s) => s.queue.length > 0)

  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }, [theme])

  // "/" focuses search, like most media apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(t.tagName) && !t.isContentEditable && !t.closest('.vp')) {
        e.preventDefault()
        document.getElementById('global-search')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const partyLabel = inRoom ? `Watching together · ${peers + 1}` : 'Watch together'

  return (
    <div className={`app ${hasTrack ? 'app--with-bar' : ''} ${partyOpen ? 'app--party' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Manoranjan home">
          <img src="./favicon.svg" alt="" width={30} height={30} />
          <span>Manoranjan</span>
        </NavLink>
        <nav className="nav" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav__link" title={n.hint}>
              <Icon name={n.icon} size={18} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
          }}
        >
          <Icon name="search" size={18} />
          <input
            id="global-search"
            type="search"
            placeholder="Search movies, shows, music…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search"
          />
          <kbd className="search__kbd" aria-hidden>
            /
          </kbd>
        </form>
        <button
          className={`party-toggle ${inRoom ? 'party-toggle--live' : ''}`}
          onClick={() => setPartyOpen((o) => !o)}
          aria-expanded={partyOpen}
          aria-label={partyLabel}
          title="Watch or listen in sync with friends, with chat and voice"
        >
          {inRoom && <span className="live-dot" aria-hidden />}
          <Icon name="users" size={18} />
          <span>{partyLabel}</span>
          {unread > 0 && !partyOpen && <span className="badge-dot">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <NavLink to="/settings" className="icon-btn topbar__settings" aria-label="Settings" title="Settings">
          <Icon name="settings" size={20} />
        </NavLink>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        <Outlet context={{ openParty: () => setPartyOpen(true) }} />
        <footer className="footer">
          <span>
            <Icon name="shield" size={16} /> No ads, no trackers, no account. Your history stays on this device.
          </span>
          <NavLink to="/about">About &amp; legal</NavLink>
        </footer>
      </main>

      {/* Mobile tab bar lives outside the header so `position: fixed` is relative to the viewport. */}
      <nav className="tabbar" aria-label="Primary">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="tabbar__link">
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      <PartyPanel open={partyOpen} onClose={() => setPartyOpen(false)} />
      <PartyFollower />
      <MusicBar />
      <Toasts />
    </div>
  )
}
