import { useEffect, useRef, useState, useCallback } from 'react'
import { createEngine } from '../../lib/reader/readerEngine.js'
import { getBook, getBlob, highlights as hlStore, bookmarks as bmStore } from '../../lib/db.js'
import { loadPosition, savePosition, recordReadingSeconds } from '../../lib/storage.js'
import { useSettings } from '../../context/SettingsContext.jsx'
import { useLibrary } from '../../context/LibraryContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { debounce, uid } from '../../lib/util.js'
import ReaderToolbar from './ReaderToolbar.jsx'
import ReaderSidebar from './ReaderSidebar.jsx'
import TypographyPanel from './TypographyPanel.jsx'
import SelectionMenu from './SelectionMenu.jsx'
import TranslatePopover from './TranslatePopover.jsx'
import RecapPopover from './RecapPopover.jsx'
import ReaderError from './ReaderError.jsx'
import '../../styles/reader.css'

const HIGHLIGHT_COLORS = ['#ffd54a', '#7ee787', '#7cc4ff', '#ff9db1', '#c9a0ff']

export default function ReaderView({ bookId, onExit }) {
  const { settings } = useSettings()
  const { updateBook } = useLibrary()
  const toast = useToast()

  const containerRef = useRef(null)
  const engineRef = useRef(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const [book, setBook] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)
  const [toc, setToc] = useState([])
  const [progress, setProgress] = useState(0)
  const [location, setLocation] = useState(null)
  const [pageInfo, setPageInfo] = useState(null)

  const [panel, setPanel] = useState(null) // 'toc' | 'highlights' | 'bookmarks' | 'search' | null
  const [showType, setShowType] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)

  const [highlights, setHighlights] = useState([])
  const [bookmarks, setBookmarks] = useState([])
  const [selection, setSelection] = useState(null) // { text, location, rect }
  const [translate, setTranslate] = useState(null) // { text, rect }
  const [showRecap, setShowRecap] = useState(false)
  const selectionRef = useRef(null)

  // Active-reading time accumulator for the streak. Purely event-driven: each
  // reader activity (page turn, tap) adds the gap since the last activity,
  // capped so idle-with-book-open doesn't inflate the count.
  const lastActiveRef = useRef(0)
  const markActivity = useCallback(() => {
    const now = Date.now()
    const last = lastActiveRef.current
    lastActiveRef.current = now
    if (!last) return
    const elapsed = Math.min((now - last) / 1000, 30) // cap idle gaps at 30s
    if (elapsed > 0) recordReadingSeconds(elapsed)
  }, [])
  selectionRef.current = selection || translate

  // ---- Load book + engine ------------------------------------------------
  // Re-runs when the EPUB flow (paginated/scrolled) toggles: the flow is fixed
  // at engine init, so a rebuild is required. Position is saved on teardown.
  const epubFlow = settings.flow.epub
  useEffect(() => {
    let cancelled = false
    let engine = null

    async function boot() {
      setStatus('loading')
      setSelection(null)
      setTranslate(null)
      const meta = await getBook(bookId)
      if (!meta) { setError({ kind: 'missing', message: 'This book is no longer in your library.' }); setStatus('error'); return }
      if (cancelled) return
      setBook(meta)

      const blob = await getBlob(bookId)
      if (!blob?.data) { setError({ kind: 'missing', message: 'The file for this book is missing.' }); setStatus('error'); return }

      const [hls, bms] = await Promise.all([hlStore.listByBook(bookId), bmStore.listByBook(bookId)])
      if (cancelled) return
      setHighlights(hls)
      setBookmarks(bms)

      let engineErrored = false
      try {
        engine = createEngine(meta.format, blob.data, {})
        engineRef.current = engine

        engine.on('error', (e) => { engineErrored = true; setError(e); setStatus('error') })
        engine.on('relocated', ({ location, progress, pageInfo }) => {
          markActivity()
          setLocation(location)
          setProgress(progress)
          if (pageInfo) setPageInfo(pageInfo)
          persist(location, progress)
        })
        engine.on('loaded', ({ toc }) => { setToc(toc || []); setStatus('ready') })
        engine.on('selected', (sel) => setSelection(sel))
        engine.on('highlight-click', (hl) => openHighlight(hl))
        // Events from inside the epub iframe (which never bubble to our window).
        engine.on('tap', () => { markActivity(); setShowType(false); if (!selectionRef.current) setChromeVisible((v) => !v) })
        engine.on('keydown', ({ key }) => {
          if (key === 'ArrowRight') engine.next()
          else if (key === 'ArrowLeft') engine.prev()
        })

        const startLocation = loadPosition(bookId)?.location
        await engine.init(containerRef.current, { startLocation, settings: settingsRef.current })

        // Re-apply saved highlights onto the freshly rendered content.
        hls.forEach((h) => engine.addHighlight(h))
        updateBook(bookId, { lastOpenedAt: Date.now() })
      } catch (err) {
        console.error(err)
        if (!cancelled && !engineErrored) {
          setError({ kind: 'parse', message: 'This file could not be opened.' })
          setStatus('error')
        }
      }
    }

    boot()
    return () => {
      cancelled = true
      // Save the exact position before teardown — the debounced persist may
      // not have fired yet, and the rebuilt engine resumes from loadPosition.
      try {
        const loc = engine?.getLocation?.()
        if (loc) savePosition(bookId, { location: loc, progress: engine.getProgress?.() || 0, at: Date.now() })
      } catch { /* engine may be mid-teardown */ }
      engine?.destroy()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, epubFlow])

  // Persist reading position (debounced) + library progress (shelf is derived
  // from progress inside updateBook).
  const persist = useCallback(
    debounce((location, progress) => {
      savePosition(bookId, { location, progress, at: Date.now() })
      updateBook(bookId, { progress })
    }, 500),
    [bookId]
  )

  // Live-apply typography/theme changes to the engine.
  useEffect(() => {
    engineRef.current?.applySettings(settings)
    // Margin changes resize the container; epub.js only re-flows on window
    // resize, so nudge it.
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
    return () => clearTimeout(t)
  }, [settings])

  // ---- Keyboard navigation ----------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.matches?.('input, textarea, select')) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') engineRef.current?.next()
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') engineRef.current?.prev()
      else if (e.key === 'Escape') { setPanel(null); setShowType(false); setSelection(null); setTranslate(null) }
      else if (e.key === 'f' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setPanel('search') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- Highlights / notes -----------------------------------------------
  const addHighlight = useCallback(async (color, note = '') => {
    const engine = engineRef.current
    if (!engine || !selection) return
    let loc = selection.location
    if (book.format === 'pdf') {
      const h = engine.getSelectionHighlight?.()
      if (h) loc = { page: h.page, rects: h.rects }
    }
    const hl = { id: uid(), bookId, color, note, text: selection.text.slice(0, 500), location: loc, createdAt: Date.now() }
    await hlStore.put(hl)
    engine.addHighlight(hl)
    setHighlights((prev) => [...prev, hl])
    engine.clearSelection?.()
    setSelection(null)
    return hl
  }, [selection, bookId, book])

  const updateHighlightNote = useCallback(async (id, note) => {
    const hl = highlights.find((h) => h.id === id)
    if (!hl) return
    const next = { ...hl, note }
    await hlStore.put(next)
    setHighlights((prev) => prev.map((h) => (h.id === id ? next : h)))
  }, [highlights])

  const removeHighlight = useCallback(async (hl) => {
    await hlStore.remove(hl.id)
    engineRef.current?.removeHighlight(hl)
    setHighlights((prev) => prev.filter((h) => h.id !== hl.id))
  }, [])

  const openHighlight = useCallback((hl) => { setPanel('highlights'); setChromeVisible(true) }, [])

  // ---- Bookmarks ---------------------------------------------------------
  const toggleBookmark = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return
    const loc = engine.getLocation()
    const bm = { id: uid(), bookId, location: loc, label: `${Math.round((engine.getProgress() || 0) * 100)}%`, createdAt: Date.now() }
    await bmStore.put(bm)
    setBookmarks((prev) => [...prev, bm])
    toast.success('Bookmark added.')
  }, [bookId, toast])

  const removeBookmark = useCallback(async (bm) => {
    await bmStore.remove(bm.id)
    setBookmarks((prev) => prev.filter((b) => b.id !== bm.id))
  }, [])

  // ---- Navigation from panels -------------------------------------------
  const goTo = useCallback((target) => {
    engineRef.current?.goTo(target)
    setPanel(null)
  }, [])

  const onTapReader = useCallback((e) => {
    // Tap center toggles chrome; edges page-turn on touch.
    if (selection || translate) return
    setChromeVisible((v) => !v)
  }, [selection, translate])

  if (status === 'error') {
    return <ReaderError error={error} title={book?.title} onExit={onExit} />
  }

  return (
    <div className={`reader theme-scope ${chromeVisible ? '' : 'reader--immersive'}`} data-transition={settings.pageTransition}>
      <ReaderToolbar
        book={book}
        progress={progress}
        visible={chromeVisible}
        onExit={onExit}
        onPanel={(p) => setPanel((cur) => (cur === p ? null : p))}
        activePanel={panel}
        onTypography={() => setShowType((s) => !s)}
        typographyOpen={showType}
        onBookmark={toggleBookmark}
        isBookmarked={false}
        onRecap={() => setShowRecap(true)}
      />

      <div className="reader-stage">
        {!(book?.format === 'epub' && epubFlow === 'scrolled') && (
          <button className="reader-edge reader-edge--left" onClick={() => engineRef.current?.prev()} aria-label="Previous page" tabIndex={-1}>
            <span className="reader-edge__hint">‹</span>
          </button>
        )}

        <div className="reader-viewport" ref={containerRef} onClick={onTapReader} />

        {!(book?.format === 'epub' && epubFlow === 'scrolled') && (
          <button className="reader-edge reader-edge--right" onClick={() => engineRef.current?.next()} aria-label="Next page" tabIndex={-1}>
            <span className="reader-edge__hint">›</span>
          </button>
        )}

        {status === 'loading' && (
          <div className="reader-loading"><div className="spinner" /><span>Opening {book?.title || 'book'}…</span></div>
        )}
      </div>

      {chromeVisible && (
        <div className="reader-footer">
          {pageInfo && (
            <span className="reader-pageinfo">
              {pageInfo.kind === 'page' ? 'Page' : 'Loc'} {pageInfo.current} of {pageInfo.total}
            </span>
          )}
          <div className="reader-progress-bar" title={`${Math.round(progress * 100)}% read`}>
            <div className="reader-progress-bar__fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="reader-pageinfo reader-pageinfo--pct">{Math.round(progress * 100)}%</span>
        </div>
      )}

      {showType && <TypographyPanel onClose={() => setShowType(false)} format={book?.format} />}

      {panel && (
        <ReaderSidebar
          panel={panel}
          book={book}
          toc={toc}
          highlights={highlights}
          bookmarks={bookmarks}
          engine={engineRef.current}
          currentLocation={location}
          onClose={() => setPanel(null)}
          onNavigate={goTo}
          onRemoveHighlight={removeHighlight}
          onUpdateNote={updateHighlightNote}
          onRemoveBookmark={removeBookmark}
        />
      )}

      {selection && (
        <SelectionMenu
          selection={selection}
          colors={HIGHLIGHT_COLORS}
          onHighlight={addHighlight}
          onTranslate={() => { setTranslate({ text: selection.text, rect: selection.rect }); setSelection(null) }}
          onCopy={() => { navigator.clipboard?.writeText(selection.text); toast.success('Copied.'); setSelection(null) }}
          onDismiss={() => { engineRef.current?.clearSelection?.(); setSelection(null) }}
        />
      )}

      {translate && (
        <TranslatePopover
          text={translate.text}
          rect={translate.rect}
          onClose={() => setTranslate(null)}
        />
      )}

      {showRecap && (
        <RecapPopover
          engine={engineRef.current}
          onClose={() => setShowRecap(false)}
        />
      )}
    </div>
  )
}


