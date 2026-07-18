import { useState, useEffect, useCallback } from 'react'
import LibraryView from './components/Library/LibraryView.jsx'
import ReaderView from './components/Reader/ReaderView.jsx'
import StorageWarning from './components/Library/StorageWarning.jsx'
import './styles/app.css'

// Tiny hash-based router so the browser back button works and reads are linkable
// (#/read/<bookId>). No react-router needed for two views.
function parseHash() {
  const h = window.location.hash.replace(/^#/, '')
  const m = h.match(/^\/read\/(.+)$/)
  return m ? { view: 'reader', bookId: decodeURIComponent(m[1]) } : { view: 'library' }
}

export default function App() {
  const [route, setRoute] = useState(parseHash)

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const openBook = useCallback((id) => { window.location.hash = `#/read/${encodeURIComponent(id)}` }, [])
  const goLibrary = useCallback(() => { window.location.hash = '#/' }, [])

  return (
    <>
      {route.view === 'reader'
        ? <ReaderView bookId={route.bookId} onExit={goLibrary} />
        : <LibraryView onOpenBook={openBook} />}
      <StorageWarning />
    </>
  )
}
