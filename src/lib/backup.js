import JSZip from 'jszip'
import { getAllBooks, getBlob, putBook, putBlob, highlights, bookmarks } from './db.js'
import { loadPosition, savePosition } from './storage.js'

// Manual backup/restore — the only way to move a library between browsers/devices
// since there is no backend/sync. Produces a .zip containing a manifest, every
// book's raw bytes, and all annotations/positions.

export async function exportLibrary(onProgress) {
  const zip = new JSZip()
  const books = await getAllBooks()
  const manifest = { version: 1, exportedAt: Date.now(), books: [] }

  const filesDir = zip.folder('books')
  let done = 0
  for (const book of books) {
    const blob = await getBlob(book.id)
    const hls = await highlights.listByBook(book.id)
    const bms = await bookmarks.listByBook(book.id)
    const position = loadPosition(book.id)

    if (blob?.data) {
      filesDir.file(`${book.id}.${book.format}`, blob.data)
    }
    manifest.books.push({
      ...book,
      cover: book.cover || null,
      _highlights: hls,
      _bookmarks: bms,
      _position: position
    })
    onProgress?.(++done, books.length)
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export async function importLibrary(file, onProgress) {
  const zip = await JSZip.loadAsync(file)
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new Error('Not a valid BookReader backup (missing manifest.json).')

  const manifest = JSON.parse(await manifestFile.async('string'))
  if (!Array.isArray(manifest.books)) throw new Error('Backup manifest is malformed.')

  let done = 0
  for (const entry of manifest.books) {
    const { _highlights = [], _bookmarks = [], _position, ...book } = entry

    // Restore raw file bytes if present.
    const blobFile = zip.file(`books/${book.id}.${book.format}`)
    if (blobFile) {
      const data = await blobFile.async('arraybuffer')
      await putBlob(book.id, data, book.format === 'pdf' ? 'application/pdf' : 'application/epub+zip')
    }

    await putBook({ ...book, importedAt: Date.now() })
    for (const hl of _highlights) await highlights.put(hl)
    for (const bm of _bookmarks) await bookmarks.put(bm)
    if (_position) savePosition(book.id, _position)

    onProgress?.(++done, manifest.books.length)
  }
  return { imported: manifest.books.length }
}
