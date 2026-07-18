import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { getAllBooks, putBook, deleteBook, putBlob, getStorageEstimate } from '../lib/db.js'
import { extractMetadata } from '../lib/metadata.js'
import { convertPdfToEpub } from '../lib/pdfToEpub.js'
import { guessAuthor, hasGeminiKey, GeminiError } from '../lib/gemini.js'
import { clearPosition } from '../lib/storage.js'
import { fileToArrayBuffer, detectFormat, uid } from '../lib/util.js'
import { useToast } from './ToastContext.jsx'

const LibraryContext = createContext(null)

// Shelves map to the brief's reading lists.
export const SHELVES = [
  { id: 'reading', label: 'Reading' },
  { id: 'to-read', label: 'To read' },
  { id: 'finished', label: 'Finished' }
]

// Shelf is derived from progress — no manual moves.
export function shelfForProgress(p = 0) {
  return p >= 0.98 ? 'finished' : p > 0 ? 'reading' : 'to-read'
}

export function LibraryProvider({ children }) {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [storage, setStorage] = useState(null)
  const toast = useToast()
  const enrichedOnce = useRef(false)

  const refresh = useCallback(async () => {
    let all = await getAllBooks()
    // Normalize shelves saved by older versions (manual moves) to the derived value.
    const stale = all.filter((b) => b.shelf !== shelfForProgress(b.progress))
    if (stale.length) {
      all = all.map((b) => (b.shelf === shelfForProgress(b.progress) ? b : { ...b, shelf: shelfForProgress(b.progress) }))
      await Promise.all(stale.map((b) => putBook({ ...b, shelf: shelfForProgress(b.progress) })))
    }
    setBooks(all)
    setStorage(await getStorageEstimate())
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const updateBook = useCallback(async (id, patch) => {
    // Progress drives the shelf automatically.
    if (patch.progress !== undefined) patch = { ...patch, shelf: shelfForProgress(patch.progress) }
    let next
    setBooks((prev) => prev.map((b) => {
      if (b.id !== id) return b
      next = { ...b, ...patch }
      return next
    }))
    if (next) await putBook(next)
  }, [])

  // Best-effort author lookup via the user's Gemini key. Silent on failure —
  // it's a cosmetic enrichment, never worth an error toast.
  const enrichAuthor = useCallback(async (book) => {
    if (!hasGeminiKey() || book.author) return
    try {
      const author = await guessAuthor(book.title)
      if (author) await updateBook(book.id, { author })
    } catch (err) {
      console.warn('author enrichment failed', err)
      if (err instanceof GeminiError && (err.kind === 'rate-limit' || err.kind === 'invalid-key' || err.kind === 'no-key')) {
        throw err // let batch loops stop early
      }
    }
  }, [updateBook])

  // One background pass over existing books missing an author.
  useEffect(() => {
    if (loading || enrichedOnce.current || !hasGeminiKey()) return
    enrichedOnce.current = true
    const missing = books.filter((b) => !b.author).slice(0, 10)
    if (!missing.length) return
    ;(async () => {
      for (const book of missing) {
        try {
          await enrichAuthor(book)
        } catch {
          break // rate-limited or bad key — stop for this session
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
    })()
  }, [loading, books, enrichAuthor])

  // Add one or more files. Returns the created book records.
  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList)
    const created = []
    for (const file of files) {
      const format = detectFormat(file)
      if (!format) {
        toast.error(`"${file.name}" is not an EPUB or PDF.`)
        continue
      }
      try {
        const buffer = await fileToArrayBuffer(file)
        const meta = await extractMetadata(format, buffer, file.name)

        // Text PDFs convert directly. Scanned PDFs are OCRed into reflowable text.
        let storeFormat = format
        let storeBuffer = buffer
        let storeType = file.type
        let convertedFrom = null
        if (format === 'pdf') {
          try {
            const converted = await convertPdfToEpub(buffer, meta)
            if (converted) {
              storeFormat = 'epub'
              storeBuffer = converted.epubBuffer
              storeType = 'application/epub+zip'
              convertedFrom = 'pdf'
              toast.info(`"${file.name}" converted to a reflowable EPUB.`)
            } else {
              toast.info(`"${file.name}" is too large to convert here — kept as PDF.`)
            }
          } catch (err) {
            console.error('pdf→epub conversion failed, keeping PDF', err)
          }
        }

        const id = uid()
        const book = {
          id,
          format: storeFormat,
          convertedFrom,
          title: meta.title,
          author: meta.author,
          cover: meta.cover,
          size: storeBuffer.byteLength,
          shelf: 'to-read',
          addedAt: Date.now(),
          lastOpenedAt: null,
          progress: 0
        }
        await putBlob(id, storeBuffer, storeType)
        await putBook(book)
        created.push(book)
      } catch (err) {
        console.error(err)
        if (err?.name === 'QuotaExceededError' || /quota/i.test(String(err))) {
          toast.error('Storage full — free up space or remove some books.')
        } else {
          toast.error(`Could not import "${file.name}".`)
        }
      }
    }
    if (created.length) {
      toast.success(`Added ${created.length} book${created.length > 1 ? 's' : ''}.`)
      await refresh()
      // Fire-and-forget author lookup for the new arrivals.
      ;(async () => {
        for (const book of created.filter((b) => !b.author)) {
          try {
            await enrichAuthor(book)
          } catch {
            break
          }
        }
      })()
    }
    return created
  }, [refresh, toast, enrichAuthor])

  const removeBook = useCallback(async (id) => {
    try {
      await deleteBook(id)
      clearPosition(id)
      setBooks((prev) => prev.filter((b) => b.id !== id))
      setStorage(await getStorageEstimate())
      toast.info('Book removed.')
    } catch (err) {
      console.error(err)
      toast.error('Could not remove the book — try again.')
    }
  }, [toast])

  return (
    <LibraryContext.Provider
      value={{ books, loading, storage, refresh, addFiles, updateBook, removeBook }}
    >
      {children}
    </LibraryContext.Provider>
  )
}

export function useLibrary() {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider')
  return ctx
}







