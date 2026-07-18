import { useLibrary } from '../../context/LibraryContext.jsx'
import { formatBytes } from '../../lib/util.js'
import { useState } from 'react'

// Phase 4: warn when IndexedDB usage approaches the browser's quota.
export default function StorageWarning() {
  const { storage } = useLibrary()
  const [dismissed, setDismissed] = useState(false)

  if (!storage || dismissed) return null
  if (storage.ratio < 0.8) return null

  const critical = storage.ratio >= 0.95
  return (
    <div className={`storage-warning ${critical ? 'storage-warning--critical' : ''}`} role="alert">
      <strong>{critical ? 'Storage almost full' : 'Storage filling up'}</strong>
      <span>
        Using {formatBytes(storage.usage)} of {formatBytes(storage.quota)} ({Math.round(storage.ratio * 100)}%).
        {critical ? ' New books may fail to save — remove some or export a backup.' : ' Consider exporting a backup.'}
      </span>
      <button className="icon-btn" onClick={() => setDismissed(true)} aria-label="Dismiss">✕</button>
    </div>
  )
}
