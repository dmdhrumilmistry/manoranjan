import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useRoom } from '../state/room'
import { useSettings } from '../state/settings'
import { usePlayer } from '../state/player'
import { Icon, type IconName } from './Icon'
import { MusicBar } from './MusicBar'
import { PartyPanel } from './PartyPanel'
import { PartyFollower } from './PartyFollower'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/movies', label: 'Movies', icon: 'film' },
  { to: '/series', label: 'Series', icon: 'tv' },
  { to: '/music', label: 'Music', icon: 'music' },
  { to: '/local', label: 'My files', icon: 'upload' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
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
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault()
        document.getElementById('global-search')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app ${hasTrack ? 'app--with-bar' : ''} ${partyOpen ? 'app--party' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Manoranjan home">
          <img src="./favicon.svg" alt="" width={28} height={28} />
          <span>Manoranjan</span>
        </NavLink>
        <nav className="nav" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav__link">
              <Icon name={n.icon} size={20} />
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
            placeholder="Search films, series, music…  ( / )"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search"
          />
        </form>
        <button
          className={`party-toggle ${inRoom ? 'party-toggle--live' : ''}`}
          onClick={() => setPartyOpen((o) => !o)}
          aria-expanded={partyOpen}
          aria-label="Watch party"
        >
          <Icon name="users" size={20} />
          <span>{inRoom ? `Party · ${peers + 1}` : 'Party'}</span>
          {unread > 0 && !partyOpen && <span className="badge-dot">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        <Outlet context={{ openParty: () => setPartyOpen(true) }} />
        <footer className="footer">
          <Icon name="shield" size={16} /> No ads · no trackers · no accounts. Everything personal stays in your browser.
          <NavLink to="/about">About &amp; legal</NavLink>
        </footer>
      </main>

      <PartyPanel open={partyOpen} onClose={() => setPartyOpen(false)} />
      <PartyFollower />
      <MusicBar />
    </div>
  )
}
