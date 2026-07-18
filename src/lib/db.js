import { openDB } from 'idb'

// Everything lives in the browser. Books/blobs go in IndexedDB (localStorage's
// ~5-10MB cap can't hold real EPUB/PDF files). Small metadata + settings live in
// localStorage (see storage.js).

const DB_NAME = 'bookreader'
const DB_VERSION = 1

let _dbPromise = null

export function getDB() {
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Book metadata (title, author, cover thumbnail, shelf, dates...).
        if (!db.objectStoreNames.contains('books')) {
          const books = db.createObjectStore('books', { keyPath: 'id' })
          books.createIndex('addedAt', 'addedAt')
          books.createIndex('shelf', 'shelf')
        }
        // The raw file bytes, kept separate so we can load the list without the blobs.
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'id' })
        }
        // Annotations keyed by their own id, indexed by book.
        for (const name of ['highlights', 'bookmarks']) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' })
            store.createIndex('bookId', 'bookId')
          }
        }
      }
    })
  }
  return _dbPromise
}

// ---- Books ----------------------------------------------------------------

export async function putBook(book) {
  const db = await getDB()
  await db.put('books', book)
  return book
}

export async function getBook(id) {
  const db = await getDB()
  return db.get('books', id)
}

export async function getAllBooks() {
  const db = await getDB()
  const books = await db.getAll('books')
  return books.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
}

export async function deleteBook(id) {
  const db = await getDB()
  const tx = db.transaction(['books', 'blobs', 'highlights', 'bookmarks'], 'readwrite')
  await tx.objectStore('books').delete(id)
  await tx.objectStore('blobs').delete(id)
  for (const name of ['highlights', 'bookmarks']) {
    const store = tx.objectStore(name)
    const keys = await store.index('bookId').getAllKeys(id)
    await Promise.all(keys.map((k) => store.delete(k)))
  }
  await tx.done
}

// ---- Blobs ----------------------------------------------------------------

export async function putBlob(id, data, type) {
  const db = await getDB()
  await db.put('blobs', { id, data, type })
}

export async function getBlob(id) {
  const db = await getDB()
  return db.get('blobs', id)
}

// ---- Annotations (highlights + bookmarks share the same shape helpers) -----

function annotationApi(store) {
  return {
    async put(item) {
      const db = await getDB()
      await db.put(store, item)
      return item
    },
    async remove(id) {
      const db = await getDB()
      await db.delete(store, id)
    },
    async listByBook(bookId) {
      const db = await getDB()
      return db.getAllFromIndex(store, 'bookId', bookId)
    },
    async all() {
      const db = await getDB()
      return db.getAll(store)
    }
  }
}

export const highlights = annotationApi('highlights')
export const bookmarks = annotationApi('bookmarks')

// ---- Storage estimate (Phase 4: warn near browser caps) --------------------

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return { usage, quota, ratio: quota ? usage / quota : 0 }
  } catch {
    return null
  }
}
