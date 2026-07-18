import { useEffect, useRef, useState } from 'react'
import { useLibrary } from '../../context/LibraryContext.jsx'
import { Icon } from '../common/Icon.jsx'
import Modal from '../common/Modal.jsx'
import { formatBytes } from '../../lib/util.js'

const needsDetails = (book) => !book.cover || !book.author || /^(untitled|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test((book.title || '').trim())

function DetailsModal({ book, onClose }) {
  const { updateBook } = useLibrary()
  const [title, setTitle] = useState(book.title || '')
  const [author, setAuthor] = useState(book.author || '')
  const [cover, setCover] = useState(book.cover || null)
  const [saving, setSaving] = useState(false)
  const imageInput = useRef(null)
  const save = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    try { await updateBook(book.id, { title: title.trim(), author: author.trim(), cover }); onClose() } finally { setSaving(false) }
  }
  const pickCover = (file) => {
    if (!file?.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => setCover(String(reader.result))
    reader.readAsDataURL(file)
  }
  return <Modal title="Fix book details" onClose={onClose} className="modal--details" footer={<><button className="btn" disabled={saving} onClick={onClose}>Cancel</button><button className="btn btn--primary" disabled={!title.trim() || saving} onClick={save}>{saving ? <><span className="btn-spinner" /> Saving</> : 'Save details'}</button></>}>
    <div className="details-editor"><button className="details-editor__cover" onClick={() => imageInput.current?.click()}>{cover ? <img src={cover} alt="Cover preview" /> : <span><Icon.Upload width={20} height={20} />Add cover</span>}<i>Change</i></button><input ref={imageInput} type="file" hidden accept="image/*" onChange={(event) => pickCover(event.target.files?.[0])} /><div className="details-editor__fields"><label>Title<input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Book title" autoFocus /></label><label>Author<input className="input" value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Author name" /></label><p>For externally converted EPUBs, add the correct details once and they stay saved in your library.</p></div></div>
  </Modal>
}

export default function BookCard({ book, onOpen, index = 0 }) {
  const { removeBook } = useLibrary()
  const [menu, setMenu] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [editDetails, setEditDetails] = useState(false)
  const [removing, setRemoving] = useState(false)
  const menuRef = useRef(null)
  const incomplete = needsDetails(book)

  useEffect(() => {
    if (!menu) return
    const onDoc = (event) => { if (!menuRef.current?.contains(event.target)) setMenu(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menu])

  const pct = Math.round((book.progress || 0) * 100)
  const confirmDeletion = async () => { if (removing) return; setRemoving(true); try { await removeBook(book.id); setConfirmRemove(false) } finally { setRemoving(false) } }

  return <div className="book-card" style={{ '--stagger': `${Math.min(index, 12) * 45}ms` }}>
    <button className="book-cover" onClick={onOpen} aria-label={`Open ${book.title}`}><span className="book-cover__sheen" aria-hidden /><img src={book.cover || '/default-book-cover.png'} alt="" loading="lazy" />{pct > 0 && <div className="book-cover__progress" title={`${pct}% read`}><div className="book-cover__progress-bar" style={{ width: `${pct}%` }} /></div>}<span className="book-format-tag">{book.format}</span></button>
    <div className="book-meta"><div className="book-meta__text" onClick={onOpen}><span className="book-title" title={book.title}>{book.title}</span><span className="book-author">{book.author || 'Unknown author'}</span></div><div className="book-menu" ref={menuRef}><button className="icon-btn book-menu__btn" onClick={() => setMenu((value) => !value)} aria-label="Book options"><Icon.Dots width={18} height={18} /></button>{menu && <div className="popover book-menu__pop"><div className="popover__meta muted">{formatBytes(book.size)} · {pct}% read</div><button className="popover__item" onClick={() => { setMenu(false); setEditDetails(true) }}><Icon.Aa width={16} height={16} /> {incomplete ? 'Fix book details' : 'Edit details'}</button><button className="popover__item popover__item--danger" onClick={() => { setMenu(false); setConfirmRemove(true) }}><Icon.Trash width={16} height={16} /> Remove</button></div>}</div></div>
    {editDetails && <DetailsModal book={book} onClose={() => setEditDetails(false)} />}
    {confirmRemove && <Modal title="Remove book" onClose={() => !removing && setConfirmRemove(false)} className="modal--remove" footer={<><button className="btn" disabled={removing} onClick={() => setConfirmRemove(false)}>Keep book</button><button className="btn btn--danger modal-remove__action" disabled={removing} onClick={confirmDeletion}>{removing ? <><span className="btn-spinner" /> Removing</> : <><Icon.Trash width={16} height={16} /> Remove permanently</>}</button></>}><div className="modal-remove__content"><span className="modal-remove__icon"><Icon.Trash width={22} height={22} /></span><div><p className="modal-remove__lead">Remove <strong>{book.title}</strong> from your library?</p><p className="modal-remove__copy">This also deletes its saved position, highlights, and bookmarks from this browser. This cannot be undone.</p></div></div></Modal>}
  </div>
}
