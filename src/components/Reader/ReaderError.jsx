import { Icon } from '../common/Icon.jsx'

// Friendly full-screen error for unreadable/DRM/missing files — never a crash.
export default function ReaderError({ error, title, onExit }) {
  const messages = {
    drm: {
      head: 'This book is locked',
      body: error?.message || 'This file is DRM-protected or password-locked, so it can’t be opened here.'
    },
    parse: {
      head: 'Couldn’t open this book',
      body: error?.message || 'The file appears to be malformed or corrupted.'
    },
    missing: {
      head: 'Book not found',
      body: error?.message || 'This book is no longer in your library.'
    }
  }
  const m = messages[error?.kind] || messages.parse

  return (
    <div className="reader-error">
      <div className="reader-error__card">
        <div className="reader-error__icon"><Icon.Book width={40} height={40} /></div>
        <h2>{m.head}</h2>
        {title && <p className="reader-error__title muted">“{title}”</p>}
        <p>{m.body}</p>
        <button className="btn btn--primary" onClick={onExit}>
          <Icon.Back width={18} height={18} /> Back to library
        </button>
      </div>
    </div>
  )
}
