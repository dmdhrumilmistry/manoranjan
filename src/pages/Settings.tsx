import { useState } from 'react'
import { useSettings } from '../state/settings'
import { useLibrary } from '../state/library'
import { jellyfin, tmdb } from '../providers'
import { blockedCount } from '../lib/shield'
import { Icon } from '../components/Icon'

const BACKUP_KEYS = [
  'region', 'jellyfinUrl', 'jellyfinUserId', 'archiveEnabled', 'audiusEnabled', 'displayName', 'theme', 'turnUrl', 'turnUser',
] as const

type Check = { state: 'idle' | 'busy' | 'ok' | 'fail'; msg?: string }

function Field(props: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{props.label}</span>
      {props.children}
      {props.hint && <span className="field__hint">{props.hint}</span>}
    </label>
  )
}

function Status({ c }: { c: Check }) {
  if (c.state === 'idle') return null
  return <span className={`status status--${c.state}`}>{c.state === 'busy' ? 'Checking…' : c.state === 'ok' ? 'Connected' : c.msg}</span>
}

export default function Settings() {
  const s = useSettings()
  const lib = useLibrary()
  const [jf, setJf] = useState<Check>({ state: 'idle' })
  const [tm, setTm] = useState<Check>({ state: 'idle' })

  const test = async (fn: () => Promise<unknown>, set: (c: Check) => void) => {
    set({ state: 'busy' })
    try {
      await fn()
      set({ state: 'ok' })
    } catch (e) {
      set({ state: 'fail', msg: e instanceof Error ? e.message : 'Failed' })
    }
  }

  const exportData = () => {
    // Secrets (API keys, TURN credential) are deliberately left out of backups.
    const safeSettings = Object.fromEntries(BACKUP_KEYS.map((k) => [k, s[k]]))
    const blob = new Blob([JSON.stringify({ v: 1, settings: safeSettings, history: lib.history, watchlist: lib.watchlist, progress: lib.progress }, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'manoranjan-backup.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const importData = async (file: File | undefined) => {
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (data?.v !== 1) throw new Error('Unrecognised backup')
      useLibrary.setState({
        history: Array.isArray(data.history) ? data.history : [],
        watchlist: Array.isArray(data.watchlist) ? data.watchlist : [],
        progress: typeof data.progress === 'object' && data.progress ? data.progress : {},
      })
      if (data.settings && typeof data.settings === 'object') {
        const patch: Record<string, unknown> = {}
        for (const k of BACKUP_KEYS) if (k in data.settings) patch[k] = data.settings[k]
        s.set(patch)
      }
      alert('Backup restored.')
    } catch (e) {
      alert(`Import failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <div className="page page--settings">
      <h1>Settings</h1>
      <p className="muted">Everything here is stored only in this browser.</p>

      <section className="card-section">
        <h2>Sources</h2>
        <label className="toggle">
          <input type="checkbox" checked={s.archiveEnabled} onChange={(e) => s.set({ archiveEnabled: e.target.checked })} />
          <span>
            <strong>Internet Archive</strong> — public-domain films, classic TV and cartoons
          </span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.audiusEnabled} onChange={(e) => s.set({ audiusEnabled: e.target.checked })} />
          <span>
            <strong>Audius</strong> — free full-length music from independent artists
          </span>
        </label>

        <h3>TMDB (optional)</h3>
        <Field
          label="API key or read-access token"
          hint={
            <>
              Free at <a href="https://www.themoviedb.org/settings/api">themoviedb.org/settings/api</a>. Adds posters, trailers and
              legal “where to watch” links.
            </>
          }
        >
          <input type="password" value={s.tmdbKey} onChange={(e) => s.set({ tmdbKey: e.target.value })} autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Region for streaming offers" hint="Two-letter country code, e.g. IN, US, GB">
          <input value={s.region} maxLength={2} onChange={(e) => s.set({ region: e.target.value.toUpperCase() })} />
        </Field>
        <button className="btn btn--small" disabled={!s.tmdbKey} onClick={() => void test(() => tmdb.trending('movie'), setTm)}>
          Test TMDB
        </button>
        <Status c={tm} />

        <h3>Jellyfin (your own media server)</h3>
        <Field label="Server URL" hint="e.g. https://media.example.com — must be HTTPS when this site is on GitHub Pages.">
          <input type="url" value={s.jellyfinUrl} onChange={(e) => s.set({ jellyfinUrl: e.target.value })} placeholder="https://" />
        </Field>
        <Field label="API key" hint="Dashboard → API Keys → +">
          <input type="password" value={s.jellyfinKey} onChange={(e) => s.set({ jellyfinKey: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="User ID (optional)" hint="Scopes the library to one user’s permissions and watch state.">
          <input value={s.jellyfinUserId} onChange={(e) => s.set({ jellyfinUserId: e.target.value })} spellCheck={false} />
        </Field>
        <button className="btn btn--small" disabled={!jellyfin.enabled()} onClick={() => void test(() => jellyfin.trending('movie'), setJf)}>
          Test Jellyfin
        </button>
        <Status c={jf} />
      </section>

      <section className="card-section">
        <h2>Party</h2>
        <Field label="Display name">
          <input value={s.displayName} maxLength={32} onChange={(e) => s.set({ displayName: e.target.value })} />
        </Field>
        <details>
          <summary>TURN relay (for friends behind strict firewalls)</summary>
          <p className="small muted">
            Most connections work peer-to-peer. If someone can’t connect, add a TURN server (e.g. a free Metered or self-hosted coturn).
          </p>
          <Field label="TURN URL">
            <input value={s.turnUrl} onChange={(e) => s.set({ turnUrl: e.target.value })} placeholder="turn:turn.example.com:3478" />
          </Field>
          <Field label="Username">
            <input value={s.turnUser} onChange={(e) => s.set({ turnUser: e.target.value })} />
          </Field>
          <Field label="Credential">
            <input type="password" value={s.turnPass} onChange={(e) => s.set({ turnPass: e.target.value })} autoComplete="off" />
          </Field>
        </details>
      </section>

      <section className="card-section">
        <h2>Appearance</h2>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {(['system', 'dark', 'light'] as const).map((t) => (
            <button key={t} role="radio" aria-checked={s.theme === t} onClick={() => s.set({ theme: t })}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="card-section">
        <h2>Privacy &amp; data</h2>
        <p>
          <Icon name="shield" size={16} /> Popups blocked this session: <strong>{blockedCount()}</strong>. No analytics, no cookies,
          no third-party scripts (enforced by Content-Security-Policy).
        </p>
        <p className="muted small">
          {lib.history.length} history events · {lib.watchlist.length} in My list · {lib.pool.length} titles in the local recommendation pool
        </p>
        <div className="hero__actions">
          <button className="btn" onClick={exportData}>Export backup</button>
          <label className="btn">
            Import backup
            <input type="file" accept="application/json" className="sr-only" onChange={(e) => void importData(e.target.files?.[0])} />
          </label>
          <button
            className="btn btn--danger"
            onClick={() => confirm('Clear watch history, My list and recommendations?') && lib.clear()}
          >
            Clear history
          </button>
          <button className="btn btn--ghost" onClick={() => confirm('Reset all settings?') && s.reset()}>
            Reset settings
          </button>
        </div>
      </section>
    </div>
  )
}
