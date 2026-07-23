import { useState, useEffect, useCallback } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import {
  connect, disconnect, sync,
  getState, onSyncStateChange,
  getSyncPassphrase, setSyncPassphrase,
  getSyncGemini, setSyncGemini,
  setAutoSync
} from '../../lib/sync.js'

// Cloud sync settings panel — embedded inside SettingsModal.
// Handles Google Drive OAuth, persistent settings, and continuous 1-minute background auto-sync.
export default function SyncSettings() {
  const toast = useToast()
  const [state, setState] = useState(getState)
  const [passphrase, setPassphraseState] = useState(() => getSyncPassphrase())
  const [syncGemini, setSyncGeminiState] = useState(() => getSyncGemini())
  const [busy, setBusy] = useState(null) // 'connect' | 'sync' | 'disconnect' | null

  useEffect(() => {
    return onSyncStateChange((newState) => {
      setState(newState)
      setPassphraseState(getSyncPassphrase())
      setSyncGeminiState(getSyncGemini())
    })
  }, [])

  const handlePassphraseChange = (e) => {
    const val = e.target.value
    setPassphraseState(val)
    setSyncPassphrase(val)
  }

  const handleSyncGeminiChange = (e) => {
    const val = e.target.checked
    setSyncGeminiState(val)
    setSyncGemini(val)
  }

  const doConnect = useCallback(async () => {
    setBusy('connect')
    try {
      await connect()
      toast.success('Connected to Google Drive.')
    } catch (err) {
      console.error('Drive connect failed:', err)
      toast.error(err.message || 'Could not connect to Google Drive.')
    } finally {
      setBusy(null)
    }
  }, [toast])

  const doDisconnect = useCallback(() => {
    disconnect()
    setPassphraseState('')
    toast.info('Disconnected from Google Drive.')
  }, [toast])

  const toggleAutoSync = useCallback(async () => {
    if (!passphrase.trim()) {
      toast.error('Enter an encryption passphrase first.')
      return
    }

    if (state.autoSyncActive) {
      setAutoSync(false)
      toast.info('Auto-sync stopped.')
    } else {
      setSyncPassphrase(passphrase.trim())
      setAutoSync(true)
      setBusy('sync')
      try {
        const result = await sync(passphrase.trim(), { syncGemini })
        const msg = result.action === 'uploaded'
          ? 'Auto-sync started — initial data uploaded.'
          : result.action === 'merged'
            ? 'Auto-sync started — data merged.'
            : 'Auto-sync started — up to date.'
        toast.success(msg)
      } catch (err) {
        console.error('Initial sync failed:', err)
        toast.error(err.message || 'Sync failed.')
      } finally {
        setBusy(null)
      }
    }
  }, [passphrase, syncGemini, state.autoSyncActive, toast])

  const formatLastSync = (ts) => {
    if (!ts) return 'Never'
    const diff = Math.round((Date.now() - ts) / 1000)
    if (diff < 30) return 'Just now'
    if (diff < 90) return '1 min ago'
    if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (!state.clientIdConfigured) {
    return (
      <div className="sync-note">
        <p>
          <strong>Cloud sync requires a Google Cloud project.</strong> Create an OAuth 2.0 Client ID
          in the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud Console</a>,
          then set <code>VITE_GOOGLE_CLIENT_ID</code> in your <code>.env</code> file.
        </p>
        <p className="muted" style={{ margin: 0 }}>
          This is a one-time setup — your Google account is used directly, no server involved.
        </p>
      </div>
    )
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      {!state.connected ? (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Sync your books, reading progress, highlights, bookmarks, and settings across devices
            using your own Google Drive. Data is encrypted with a passphrase before upload.
          </p>
          <div className="field__actions">
            <button
              className="btn btn--sm btn--primary"
              onClick={doConnect}
              disabled={busy === 'connect'}
            >
              {busy === 'connect' ? <><div className="spinner" /> Connecting…</> : 'Connect Google Drive'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="sync-status">
            <span className="sync-status__dot" />
            <span>Connected to Google Drive</span>
            <button className="btn btn--sm" onClick={doDisconnect} disabled={!!busy}>
              Disconnect
            </button>
          </div>

          <label className="field">
            <span className="field__label">Encryption passphrase</span>
            <input
              className="input" type="password"
              placeholder="Enter a passphrase to encrypt your data"
              value={passphrase} onChange={handlePassphraseChange}
              autoComplete="off" spellCheck={false}
            />
            <span className="field__hint muted">
              This passphrase encrypts your data before it leaves your browser.
              Saved locally on this device for background auto-syncing.
            </span>
          </label>

          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={syncGemini}
              onChange={handleSyncGeminiChange}
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="field__label" style={{ margin: 0 }}>
              Also sync Gemini API key
            </span>
          </label>

          <div className="field__actions" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              className={`btn btn--sm ${state.autoSyncActive ? 'btn--secondary' : 'btn--primary'}`}
              onClick={toggleAutoSync}
              disabled={!!busy || (!state.autoSyncActive && !passphrase.trim())}
            >
              {busy === 'sync' || state.isAutoSyncing ? (
                <><div className="spinner" /> Syncing…</>
              ) : state.autoSyncActive ? (
                'Stop sync'
              ) : (
                'Start sync'
              )}
            </button>

            <span style={{ fontSize: 13, fontWeight: 500, color: state.autoSyncActive ? 'var(--accent)' : 'var(--fg-muted)' }}>
              {state.autoSyncActive ? '🟢 Auto-sync active (every 1 min)' : '⚪ Auto-sync paused'}
            </span>

            <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
              Last sync: <strong>{formatLastSync(state.lastSyncTime)}</strong>
            </span>
          </div>

          <p className="field__hint muted" style={{ margin: 0 }}>
            <strong>Auto-sync</strong> automatically merges books, reading positions, highlights, bookmarks, and settings between this device and Drive every 1 minute.
          </p>
        </>
      )}
    </div>
  )
}
