import { Icon } from '../common/Icon.jsx'

// Top bar: back, title, progress %, and access to panels + typography.
export default function ReaderToolbar({
  book, progress, visible, onExit, onPanel, activePanel,
  onTypography, typographyOpen, onBookmark
}) {
  return (
    <header className={`reader-toolbar ${visible ? '' : 'reader-toolbar--hidden'}`}>
      <div className="reader-toolbar__left">
        <button className="icon-btn" onClick={onExit} aria-label="Back to library" title="Library">
          <Icon.Back />
        </button>
        <div className="reader-toolbar__title">
          <span className="reader-toolbar__book" title={book?.title}>{book?.title}</span>
          <span className="reader-toolbar__progress muted">{Math.round((progress || 0) * 100)}%</span>
        </div>
      </div>

      <div className="reader-toolbar__right">
        <button className={`icon-btn ${activePanel === 'search' ? 'active' : ''}`} onClick={() => onPanel('search')} aria-label="Search" title="Search (Ctrl+F)">
          <Icon.Search />
        </button>
        <button className={`icon-btn ${activePanel === 'toc' ? 'active' : ''}`} onClick={() => onPanel('toc')} aria-label="Contents" title="Table of contents">
          <Icon.List />
        </button>
        <button className={`icon-btn ${activePanel === 'highlights' ? 'active' : ''}`} onClick={() => onPanel('highlights')} aria-label="Highlights & notes" title="Highlights & notes">
          <Icon.Highlight />
        </button>
        <button className="icon-btn" onClick={onBookmark} aria-label="Add bookmark" title="Bookmark this spot">
          <Icon.Bookmark />
        </button>
        <button className={`icon-btn ${activePanel === 'bookmarks' ? 'active' : ''}`} onClick={() => onPanel('bookmarks')} aria-label="Bookmarks" title="Bookmarks">
          <Icon.Book />
        </button>
        <button className={`icon-btn ${typographyOpen ? 'active' : ''}`} onClick={onTypography} aria-label="Text & theme" title="Text & theme">
          <Icon.Aa />
        </button>
      </div>
    </header>
  )
}
