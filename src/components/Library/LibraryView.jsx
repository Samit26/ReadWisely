import { useMemo, useRef, useState } from 'react'
import { useLibrary, SHELVES } from '../../context/LibraryContext.jsx'
import { Icon } from '../common/Icon.jsx'
import BookCard from './BookCard.jsx'
import UploadZone from './UploadZone.jsx'
import SettingsModal from '../Settings/SettingsModal.jsx'
import BackupBar from './BackupBar.jsx'
import StreakChip from './StreakChip.jsx'
import StatsSection from './StatsSection.jsx'
import Modal from '../common/Modal.jsx'

export default function LibraryView({ onOpenBook }) {
  const { books, loading, addFiles } = useLibrary()
  const [shelf, setShelf] = useState('all')
  const [query, setQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [pendingFiles, setPendingFiles] = useState(null)
  const picker = useRef(null)
  const importFiles = async (files) => { if (!files?.length || importing) return; setImporting(true); try { await addFiles(files) } finally { setImporting(false) } }
  const add = (files) => {
    const selected = Array.from(files || [])
    if (!selected.length || importing) return
    if (selected.some((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) setPendingFiles(selected)
    else importFiles(selected)
  }
  const counts = useMemo(() => Object.fromEntries([['all', books.length], ...SHELVES.map((s) => [s.id, books.filter((b) => b.shelf === s.id).length])]), [books])
  const current = useMemo(() => books.filter((b) => b.progress > 0 && b.progress < .98).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0], [books])
  const visible = useMemo(() => books.filter((book) => (shelf === 'all' || book.shelf === shelf) && (`${book.title} ${book.author || ''}`).toLowerCase().includes(query.trim().toLowerCase())), [books, shelf, query])
  const openPicker = () => picker.current?.click()

  return <main className="home">
    <header className="home-nav">
      <button className="home-brand" onClick={() => { setShelf('all'); setQuery('') }}><img className="home-brand__logo" src="/logo.png" alt="" width={31} height={31} />readwisely</button>
      <div className="home-nav__actions"><StreakChip /><button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings"><Icon.Settings /></button></div>
      <input ref={picker} type="file" hidden multiple accept=".epub,.pdf,application/epub+zip,application/pdf" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
    </header>

    <section className="home-intro"><div><p className="home-kicker">Your reading room</p><h1>A quieter place<br />for <em>every story.</em></h1><p className="home-subtitle">Keep your books offline, your progress saved, and your attention where it belongs.</p></div><div className="home-intro__note"><span className="home-intro__note-mark">“</span><p>Reading is a form of quiet resistance.</p><span>— A room of your own</span></div></section>


    <section className="home-focus">
      {current ? <button className="focus-book" onClick={() => onOpenBook(current.id)}><div className="focus-book__cover"><img src={current.cover || '/default-book-cover.png'} alt="" /></div><div className="focus-book__body"><span className="section-tag">Pick up where you left off</span><h2>{current.title}</h2><p>{current.author || 'Unknown author'}</p><div className="focus-book__progress"><i style={{ width: `${Math.round(current.progress * 100)}%` }} /></div><small>{Math.round(current.progress * 100)}% complete</small></div><span className="focus-book__arrow">Resume <b>→</b></span></button> : books.length ? <button className="focus-empty" onClick={() => onOpenBook(books[0].id)}><span className="focus-empty__icon"><Icon.Book width={24} height={24} /></span><div><span className="section-tag">Start reading</span><h2>{books[0].title}</h2><p>{books[0].author || 'Pick up your first book and dive in.'}</p></div><b>Open →</b></button> : <button className="focus-empty" onClick={openPicker}><span className="focus-empty__icon"><Icon.Upload width={24} height={24} /></span><div><span className="section-tag">Begin here</span><h2>Bring your first book in</h2><p>Import an EPUB or PDF. Your library never leaves this device.</p></div><b>Choose a file →</b></button>}
      <aside className="home-meter"><span className="section-tag">Library at a glance</span><strong>{books.length}<small> books</small></strong><div className="home-meter__row"><span>Reading</span><b>{counts.reading}</b><i style={{ width: `${books.length ? (counts.reading / books.length) * 100 : 0}%` }} /></div><div className="home-meter__row"><span>To read</span><b>{counts['to-read']}</b><i style={{ width: `${books.length ? (counts['to-read'] / books.length) * 100 : 0}%` }} /></div></aside>
    </section>

    <section className="home-library"><div className="home-library__head"><div><span className="section-tag">Collection</span><h2>Your books</h2></div><label className="home-search"><Icon.Search width={16} height={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or author" /></label></div><div className="home-shelves"><button className={shelf === 'all' ? 'active' : ''} onClick={() => setShelf('all')}>All <span>{counts.all}</span></button>{SHELVES.map((item) => <button key={item.id} className={shelf === item.id ? 'active' : ''} onClick={() => setShelf(item.id)}>{item.label} <span>{counts[item.id]}</span></button>)}</div>
      {loading ? <div className="home-loading"><div className="spinner" /><span>Opening your library</span></div> : books.length ? <UploadZone onFiles={add} compact>{visible.length ? <div className="book-grid">{visible.map((book, index) => <BookCard key={book.id} book={book} index={index} onOpen={() => onOpenBook(book.id)} />)}<button className="book-add-card" onClick={openPicker}><span><Icon.Plus width={25} height={25} /></span><strong>Add a book</strong><small>EPUB or PDF</small></button></div> : <div className="home-no-results">No matching books.</div>}</UploadZone> : <UploadZone onFiles={add}><div className="home-drop"><Icon.Book width={28} height={28} /><h3>Nothing on the shelf yet</h3><p>Drop your first EPUB or PDF here, or select it from your device.</p><button onClick={openPicker}>Select a book</button></div></UploadZone>}
    </section>
    <StatsSection books={books} />
    <BackupBar />
    {importing && <div className="home-import" role="status"><div><div className="spinner" /><strong>Converting your book</strong><p>Extracting text and preparing a readable EPUB. Scanned PDFs may take a few minutes.</p></div></div>}
    {pendingFiles && <Modal title="PDF import options" onClose={() => setPendingFiles(null)} className="modal--pdf-choice" footer={<><button className="btn" onClick={() => setPendingFiles(null)}>Cancel</button><button className="btn btn--primary" onClick={() => { const files = pendingFiles; setPendingFiles(null); importFiles(files) }}>Proceed anyway</button></>}><div className="pdf-choice"><span className="pdf-choice__icon"><img className="pdf-choice__logo" src="/logo.png" alt="" width={26} height={26} /></span><div><p className="pdf-choice__lead">For the best reading experience, convert your PDF to EPUB first.</p><p>Online converters often preserve scanned-book text and paragraph flow better. After conversion, add the EPUB here; you can fix its title and cover from Book options.</p><a className="pdf-choice__link" href="https://www.freeconvert.com/pdf-to-epub" target="_blank" rel="noreferrer">Open FreeConvert PDF to EPUB <b>↗</b></a></div></div></Modal>}
    {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
  </main>
}



