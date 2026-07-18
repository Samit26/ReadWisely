import { useState, useRef } from 'react'
import { exportLibrary, importLibrary } from '../../lib/backup.js'
import { useLibrary } from '../../context/LibraryContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { Icon } from '../common/Icon.jsx'

// Manual backup/restore — the substitute for cloud sync in a no-backend app.
export default function BackupBar() {
  const { books, refresh } = useLibrary()
  const toast = useToast()
  const [busy, setBusy] = useState(null) // 'export' | 'import' | null
  const fileRef = useRef(null)

  const doExport = async () => {
    if (!books.length) { toast.info('Nothing to export yet.'); return }
    setBusy('export')
    try {
      const blob = await exportLibrary()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `bookreader-backup-${stamp}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Library exported.')
    } catch (err) {
      console.error(err)
      toast.error('Export failed.')
    } finally {
      setBusy(null)
    }
  }

  const doImport = async (file) => {
    if (!file) return
    setBusy('import')
    try {
      const { imported } = await importLibrary(file)
      await refresh()
      toast.success(`Imported ${imported} book${imported === 1 ? '' : 's'}.`)
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Import failed — is this a BookReader backup?')
    } finally {
      setBusy(null)
    }
  }

  return (
    <footer className="backup-bar">
      <div className="backup-bar__info muted">
        <Icon.Download width={16} height={16} />
        No cloud sync by design. Back up or move your library manually.
      </div>
      <div className="backup-bar__actions">
        <button className="btn btn--sm" onClick={doExport} disabled={busy}>
          {busy === 'export' ? <div className="spinner" /> : <Icon.Download width={16} height={16} />} Export
        </button>
        <button className="btn btn--sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy === 'import' ? <div className="spinner" /> : <Icon.Upload width={16} height={16} />} Import
        </button>
        <input
          ref={fileRef} type="file" accept=".zip,application/zip" hidden
          onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = '' }}
        />
      </div>
    </footer>
  )
}
