import { useState, useCallback } from 'react'

// Drag-and-drop wrapper. In `compact` mode it just overlays a drop hint over the
// existing grid; otherwise it fills the empty-library area.
export default function UploadZone({ onFiles, children, compact }) {
  const [dragging, setDragging] = useState(false)

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files)
  }, [onFiles])

  const onDragOver = useCallback((e) => {
    if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragging(true) }
  }, [])

  return (
    <div
      className={`upload-zone ${compact ? 'upload-zone--compact' : ''} ${dragging ? 'dragging' : ''}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
    >
      {children}
      {dragging && (
        <div className="upload-overlay">
          <div className="upload-overlay__card">Drop EPUB or PDF files to add them</div>
        </div>
      )}
    </div>
  )
}
