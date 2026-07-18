import { useState, useEffect, useRef } from 'react'
import { Icon } from '../common/Icon.jsx'

// Unified right-side drawer for TOC / Highlights / Bookmarks / Search.
export default function ReaderSidebar({
  panel, book, toc, highlights, bookmarks, engine, currentLocation,
  onClose, onNavigate, onRemoveHighlight, onUpdateNote, onRemoveBookmark
}) {
  const titles = { toc: 'Contents', highlights: 'Highlights & notes', bookmarks: 'Bookmarks', search: 'Search' }

  return (
    <>
      <div className="sidebar-scrim" onClick={onClose} />
      <aside className="reader-sidebar" role="dialog" aria-label={titles[panel]}>
        <div className="reader-sidebar__head">
          <h3>{titles[panel]}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.Close /></button>
        </div>
        <div className="reader-sidebar__body">
          {panel === 'toc' && <TocList toc={toc} onNavigate={onNavigate} />}
          {panel === 'highlights' && (
            <HighlightsList highlights={highlights} onNavigate={onNavigate} onRemove={onRemoveHighlight} onUpdateNote={onUpdateNote} />
          )}
          {panel === 'bookmarks' && (
            <BookmarksList bookmarks={bookmarks} onNavigate={onNavigate} onRemove={onRemoveBookmark} />
          )}
          {panel === 'search' && <SearchPanel engine={engine} onNavigate={onNavigate} />}
        </div>
      </aside>
    </>
  )
}

function TocList({ toc, onNavigate }) {
  if (!toc?.length) return <p className="sidebar-empty muted">No table of contents in this book.</p>
  return (
    <ul className="toc-list">
      {toc.map((item, i) => (
        <li key={i} style={{ paddingLeft: `${(item.depth || 0) * 16}px` }}>
          <button className="toc-item" onClick={() => onNavigate(item.href)}>{item.label}</button>
        </li>
      ))}
    </ul>
  )
}

function HighlightsList({ highlights, onNavigate, onRemove, onUpdateNote }) {
  if (!highlights.length) {
    return <p className="sidebar-empty muted">Select text while reading to highlight it and attach a note.</p>
  }
  const sorted = [...highlights].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  return (
    <ul className="hl-list">
      {sorted.map((hl) => (
        <HighlightItem key={hl.id} hl={hl} onNavigate={onNavigate} onRemove={onRemove} onUpdateNote={onUpdateNote} />
      ))}
    </ul>
  )
}

function HighlightItem({ hl, onNavigate, onRemove, onUpdateNote }) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(hl.note || '')
  const taRef = useRef(null)
  useEffect(() => { if (editing) taRef.current?.focus() }, [editing])

  return (
    <li className="hl-item">
      <span className="hl-item__bar" style={{ background: hl.color }} />
      <div className="hl-item__content">
        <button className="hl-item__text" onClick={() => onNavigate(hl.location)} title="Jump to this highlight">
          “{hl.text}”
        </button>
        {editing ? (
          <div className="hl-item__editor">
            <textarea
              ref={taRef} className="input" rows={2} placeholder="Add a note…"
              value={note} onChange={(e) => setNote(e.target.value)}
            />
            <div className="hl-item__editor-actions">
              <button className="btn btn--sm" onClick={() => { setNote(hl.note || ''); setEditing(false) }}>Cancel</button>
              <button className="btn btn--sm btn--primary" onClick={() => { onUpdateNote(hl.id, note.trim()); setEditing(false) }}>Save</button>
            </div>
          </div>
        ) : hl.note ? (
          <p className="hl-item__note" onClick={() => setEditing(true)}><Icon.Note width={13} height={13} /> {hl.note}</p>
        ) : (
          <button className="hl-item__add-note" onClick={() => setEditing(true)}>+ Add note</button>
        )}
      </div>
      <button className="icon-btn hl-item__del" onClick={() => onRemove(hl)} aria-label="Delete highlight"><Icon.Trash width={16} height={16} /></button>
    </li>
  )
}

function BookmarksList({ bookmarks, onNavigate, onRemove }) {
  if (!bookmarks.length) return <p className="sidebar-empty muted">Tap the bookmark icon to save your spot.</p>
  const sorted = [...bookmarks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  return (
    <ul className="bm-list">
      {sorted.map((bm) => (
        <li key={bm.id} className="bm-item">
          <button className="bm-item__main" onClick={() => onNavigate(bm.location)}>
            <Icon.Bookmark width={16} height={16} />
            <span>Bookmark · {bm.label}</span>
            <time>{new Date(bm.createdAt).toLocaleDateString()}</time>
          </button>
          <button className="icon-btn" onClick={() => onRemove(bm)} aria-label="Remove bookmark"><Icon.Trash width={16} height={16} /></button>
        </li>
      ))}
    </ul>
  )
}

function SearchPanel({ engine, onNavigate }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const run = async (e) => {
    e?.preventDefault()
    const q = query.trim()
    if (!q || !engine) return
    setSearching(true)
    setResults(null)
    try {
      const res = await engine.search(q)
      setResults(res)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="search-panel">
      <form className="search-panel__form" onSubmit={run}>
        <input ref={inputRef} className="input" placeholder="Search in this book…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn btn--primary btn--sm" type="submit">Go</button>
      </form>
      {searching && <div className="search-panel__loading"><div className="spinner" /> Searching…</div>}
      {results && !searching && (
        results.length === 0
          ? <p className="sidebar-empty muted">No matches found.</p>
          : (
            <>
              <p className="search-panel__count muted">{results.length} match{results.length === 1 ? '' : 'es'}</p>
              <ul className="search-results">
                {results.map((r, i) => (
                  <li key={i}>
                    <button className="search-result" onClick={() => onNavigate(r.location)}>
                      <span className="search-result__excerpt">{r.excerpt}</span>
                      {r.page && <span className="search-result__page">p.{r.page}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )
      )}
    </div>
  )
}
