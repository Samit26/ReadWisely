// Google Drive sync engine — reads/writes a single encrypted JSON file in the
// user's Drive. No server, no backend. Uses Google Identity Services (GIS) for
// OAuth (token persisted in localStorage, auto-refreshed) and the Google Drive
// REST API (v3) directly.

import { encrypt, decrypt, bufferToBase64, base64ToBuffer } from './crypto.js'
import { getAllBooks, putBook, getBlob, putBlob, highlights, bookmarks } from './db.js'
import {
  loadSettings, loadPosition, loadReadingLog,
  getGeminiKey, getGeminiModel, getTargetLang, getSecondLang
} from './storage.js'

// ---- Config ---------------------------------------------------------------

const SYNC_FILE_NAME = 'readwisely-sync.json'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

// Google Identity Services token model — your OAuth Client ID.
// This is a public client (SPA, no secret). You must create one in
// Google Cloud Console → Credentials → OAuth 2.0 Client IDs → Web application.
// Replace this with your own Client ID before deploying.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

// Drive API v3 base
const DRIVE_API = 'https://www.googleapis.com/drive/v3'

// ---- Persistence keys -----------------------------------------------------

const TOKEN_STORAGE_KEY = 'br.drive.token'
const PASSPHRASE_STORAGE_KEY = 'br.sync.passphrase'
const SYNC_GEMINI_STORAGE_KEY = 'br.sync.gemini'
const AUTO_SYNC_STORAGE_KEY = 'br.sync.auto'
const AUTO_SYNC_INTERVAL_STORAGE_KEY = 'br.sync.interval'
const LAST_SYNC_TIME_KEY = 'br.sync.lastTime'
const SYNCED_BLOBS_KEY = 'br.sync.blobSizes'
const DELETED_BOOKS_KEY = 'br.sync.deleted'

// ---- State (module-level, memory-only) ------------------------------------

let _accessToken = null
let _tokenClient = null
let _listeners = []
let _autoSyncTimer = null
let _isAutoSyncing = false
let _lastAutoSyncError = null

// ---- Token & Option persistence helpers -----------------------------------

function _storeToken(token) {
  try { localStorage.setItem(TOKEN_STORAGE_KEY, token) } catch { /* quota */ }
}

function _clearStoredToken() {
  try { localStorage.removeItem(TOKEN_STORAGE_KEY) } catch { /* ignore */ }
}

export function getSyncPassphrase() {
  try { return localStorage.getItem(PASSPHRASE_STORAGE_KEY) || '' } catch { return '' }
}

export function setSyncPassphrase(passphrase) {
  try {
    if (passphrase) localStorage.setItem(PASSPHRASE_STORAGE_KEY, passphrase)
    else localStorage.removeItem(PASSPHRASE_STORAGE_KEY)
  } catch { /* ignore */ }
  _restartAutoSyncIfNeeded()
  notify()
}

export function getSyncGemini() {
  try { return localStorage.getItem(SYNC_GEMINI_STORAGE_KEY) === 'true' } catch { return false }
}

export function setSyncGemini(enabled) {
  try { localStorage.setItem(SYNC_GEMINI_STORAGE_KEY, String(Boolean(enabled))) } catch { /* ignore */ }
  notify()
}

export function getAutoSync() {
  try {
    const val = localStorage.getItem(AUTO_SYNC_STORAGE_KEY)
    return val === null ? true : val === 'true'
  } catch { return true }
}

export function setAutoSync(enabled) {
  try { localStorage.setItem(AUTO_SYNC_STORAGE_KEY, String(Boolean(enabled))) } catch { /* ignore */ }
  _restartAutoSyncIfNeeded()
  notify()
}

export function getAutoSyncInterval() {
  try {
    const val = parseInt(localStorage.getItem(AUTO_SYNC_INTERVAL_STORAGE_KEY) || '1', 10)
    return Number.isFinite(val) && val > 0 ? val : 1
  } catch { return 1 }
}

export function setAutoSyncInterval(minutes) {
  try { localStorage.setItem(AUTO_SYNC_INTERVAL_STORAGE_KEY, String(minutes)) } catch { /* ignore */ }
  _restartAutoSyncIfNeeded()
  notify()
}

export function getLastSyncTime() {
  try {
    const val = parseInt(localStorage.getItem(LAST_SYNC_TIME_KEY) || '0', 10)
    return Number.isFinite(val) ? val : 0
  } catch { return 0 }
}

function _recordSyncTime() {
  const now = Date.now()
  try { localStorage.setItem(LAST_SYNC_TIME_KEY, String(now)) } catch {}
  notify()
}

// ---- Auto-sync Timer Engine -----------------------------------------------

export function startAutoSync() {
  stopAutoSync()
  if (!_accessToken) return
  const passphrase = getSyncPassphrase()
  if (!passphrase) return
  if (!getAutoSync()) return

  const intervalMs = Math.max(1, getAutoSyncInterval()) * 60 * 1000

  _autoSyncTimer = setInterval(async () => {
    if (_isAutoSyncing || !_accessToken) return
    const pass = getSyncPassphrase()
    if (!pass || !getAutoSync()) {
      stopAutoSync()
      return
    }
    _isAutoSyncing = true
    notify()
    try {
      await sync(pass, { syncGemini: getSyncGemini() })
      _lastAutoSyncError = null
    } catch (err) {
      console.warn('Background auto-sync failed:', err)
      _lastAutoSyncError = err.message || 'Auto-sync failed'
    } finally {
      _isAutoSyncing = false
      notify()
    }
  }, intervalMs)

  notify()
}

export function stopAutoSync() {
  if (_autoSyncTimer) {
    clearInterval(_autoSyncTimer)
    _autoSyncTimer = null
    notify()
  }
}

function _restartAutoSyncIfNeeded() {
  if (_accessToken && getSyncPassphrase() && getAutoSync()) {
    startAutoSync()
  } else {
    stopAutoSync()
  }
}

// ---- Module init -----------------------------------------------------------

// Restore token from localStorage (survives page refresh).
const _stored = localStorage.getItem(TOKEN_STORAGE_KEY)
if (_stored) {
  _accessToken = _stored
  notify()
  startAutoSync()
}

// ---- Event system ---------------------------------------------------------

export function onSyncStateChange(fn) {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter((l) => l !== fn) }
}

function notify() {
  for (const fn of _listeners) fn(getState())
}

// ---- Public state ---------------------------------------------------------

export function getState() {
  return {
    connected: Boolean(_accessToken),
    clientIdConfigured: Boolean(GOOGLE_CLIENT_ID),
    lastSyncTime: getLastSyncTime(),
    autoSync: getAutoSync(),
    autoSyncInterval: getAutoSyncInterval(),
    isAutoSyncing: _isAutoSyncing,
    autoSyncActive: Boolean(_autoSyncTimer),
    syncGemini: getSyncGemini(),
    hasPassphrase: Boolean(getSyncPassphrase()),
    lastError: _lastAutoSyncError
  }
}

// ---- GIS (Google Identity Services) ---------------------------------------

function loadGIS() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const script = document.querySelector('script[src*="gsi/client"]') || Object.assign(document.createElement('script'), {
      src: 'https://accounts.google.com/gsi/client',
      defer: true
    })
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    if (!script.parentNode) document.head.appendChild(script)
  })
}

// ---- Auth -----------------------------------------------------------------

/**
 * Connect to Google Drive via OAuth popup.
 * Token is persisted in localStorage and auto-refreshed on page load.
 */
export async function connect() {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google Client ID is not configured. Set VITE_GOOGLE_CLIENT_ID in your .env file.')
  }
  await loadGIS()

  return new Promise((resolve, reject) => {
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          reject(new Error(tokenResponse.error))
          return
        }
        _accessToken = tokenResponse.access_token
        _storeToken(_accessToken)
        startAutoSync()
        notify()
        resolve(_accessToken)
      },
      error_callback: (err) => {
        reject(new Error(err.message || 'OAuth failed'))
      }
    })
    _tokenClient.requestAccessToken()
  })
}

export function disconnect() {
  if (_accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(_accessToken, () => {})
  }
  _accessToken = null
  _tokenClient = null
  _clearStoredToken()
  try {
    localStorage.removeItem(PASSPHRASE_STORAGE_KEY)
    localStorage.removeItem(LAST_SYNC_TIME_KEY)
    localStorage.removeItem(SYNCED_BLOBS_KEY)
  } catch {}
  stopAutoSync()
  notify()
}

// ---- Drive API helpers ----------------------------------------------------

async function driveFetch(url, opts = {}) {
  if (!_accessToken) throw new Error('Not connected to Google Drive.')

  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${_accessToken}`,
      ...opts.headers
    }
  })

  if (!res.ok) {
    let errBody = null
    try { errBody = await res.json() } catch {}
    const googleMsg = errBody?.error?.message || res.statusText || `HTTP ${res.status}`
    const reason = errBody?.error?.errors?.[0]?.reason || ''

    console.error(`Google Drive API Error (${res.status}):`, googleMsg, errBody)

    if (res.status === 401 || reason === 'authError' || reason === 'invalidCredentials') {
      _accessToken = null
      _clearStoredToken()
      stopAutoSync()
      notify()
      throw new Error('Google Drive session expired — please reconnect.')
    }

    if (res.status === 403) {
      if (reason === 'accessNotConfigured' || googleMsg.includes('has not been used') || googleMsg.includes('disabled')) {
        throw new Error('Google Drive API is disabled in your Google Cloud Project. Please enable "Google Drive API" in Google Cloud Console → APIs & Services.')
      }
      throw new Error(`Google Drive 403 Forbidden: ${googleMsg}`)
    }

    throw new Error(`Google Drive API error (${res.status}): ${googleMsg}`)
  }

  return res
}

const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

// Find the sync file in the user's Drive.
async function findSyncFile() {
  const q = encodeURIComponent(`name='${SYNC_FILE_NAME}' and trashed=false`)
  const res = await driveFetch(`${DRIVE_API}/files?q=${q}&spaces=drive&fields=files(id,modifiedTime)`)
  const data = await res.json()
  return data.files?.[0] || null
}

// Download file content by ID.
async function downloadFile(fileId) {
  const res = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`)
  return res.text()
}

// Create or update the sync file using Google Drive REST API v3 multipart upload.
async function uploadFile(content, fileId) {
  const boundary = '-------ReadWiselyBoundary' + Math.random().toString(36).slice(2)
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelimiter = `\r\n--${boundary}--`

  const metadata = {
    name: SYNC_FILE_NAME,
    mimeType: 'application/json',
    appProperties: { readwisely: 'true' }
  }

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    content +
    closeDelimiter

  const url = fileId
    ? `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart`

  const method = fileId ? 'PATCH' : 'POST'

  const res = await driveFetch(url, {
    method,
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  })

  const data = await res.json()
  return data.id || fileId
}

// ---- Data collection (local → sync payload) -------------------------------

function _getSyncedBlobSizes() {
  try { return JSON.parse(localStorage.getItem(SYNCED_BLOBS_KEY) || '{}') } catch { return {} }
}

function _setSyncedBlobSizes(map) {
  try { localStorage.setItem(SYNCED_BLOBS_KEY, JSON.stringify(map)) } catch {}
}

async function _recordBlobSizes(books) {
  const sizes = {}
  for (const b of (books || [])) {
    const blob = await getBlob(b.id)
    if (blob?.data) sizes[b.id] = blob.data.byteLength
  }
  _setSyncedBlobSizes(sizes)
}

// ---- Deletion tracking ----------------------------------------------------

function _getDeletedBookIds() {
  try { return JSON.parse(localStorage.getItem(DELETED_BOOKS_KEY) || '[]') } catch { return [] }
}

function _clearDeletedBookIds() {
  try { localStorage.removeItem(DELETED_BOOKS_KEY) } catch {}
}

export function trackDeletion(bookId) {
  const ids = _getDeletedBookIds()
  if (!ids.includes(bookId)) ids.push(bookId)
  try { localStorage.setItem(DELETED_BOOKS_KEY, JSON.stringify(ids)) } catch {}
}

export async function collectSyncData(options = {}) {
  const books = await getAllBooks()
  const allHighlights = await highlights.all()
  const allBookmarks = await bookmarks.all()

  // Collect raw file blobs — skip books already synced (same size).
  const syncedSizes = _getSyncedBlobSizes()
  const blobs = {}
  for (const b of books) {
    const blob = await getBlob(b.id)
    if (blob?.data) {
      if (syncedSizes[b.id] === blob.data.byteLength) continue // ponytail: unchanged, skip
      blobs[b.id] = {
        data: bufferToBase64(blob.data),
        type: blob.type || (b.format === 'pdf' ? 'application/pdf' : 'application/epub+zip')
      }
    }
  }

  // Collect all reading positions from localStorage.
  const positions = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('br.pos.')) {
      const bookId = key.slice(7)
      try { positions[bookId] = JSON.parse(localStorage.getItem(key)) } catch { /* skip */ }
    }
  }

  const data = {
    books,
    blobs,
    positions,
    deletedBookIds: _getDeletedBookIds(),
    settings: loadSettings(),
    highlights: allHighlights,
    bookmarks: allBookmarks,
    readingLog: loadReadingLog()
  }

  if (options.syncGemini) {
    data.geminiKey = getGeminiKey()
    data.geminiModel = getGeminiModel()
    data.targetLang = getTargetLang()
    data.secondLang = getSecondLang()
  }

  return data
}

// ---- Merge logic ----------------------------------------------------------

function mergeSyncData(local, remote) {
  if (!remote) return local
  if (!local) return remote

  // Deleted books: union of both sides' tombstones, then purge everywhere.
  const deletedSet = new Set([
    ...(local.deletedBookIds || []),
    ...(remote.deletedBookIds || [])
  ])

  // Books metadata: merge by ID, latest activity/addedAt wins, skip deleted.
  const bookMap = new Map()
  for (const b of (remote.books || [])) if (!deletedSet.has(b.id)) bookMap.set(b.id, b)
  for (const b of (local.books || [])) {
    if (deletedSet.has(b.id)) continue
    const remoteBook = bookMap.get(b.id)
    if (!remoteBook) {
      bookMap.set(b.id, b)
    } else {
      const localTime = b.lastOpenedAt || b.addedAt || 0
      const remoteTime = remoteBook.lastOpenedAt || remoteBook.addedAt || 0
      bookMap.set(b.id, localTime >= remoteTime ? { ...remoteBook, ...b } : { ...b, ...remoteBook })
    }
  }

  // Blobs: additive merge by ID, skip deleted.
  const blobs = { ...(remote.blobs || {}), ...(local.blobs || {}) }
  for (const id of deletedSet) delete blobs[id]

  // Highlights & bookmarks: additive merge by ID, skip deleted books.
  const hlMap = new Map()
  for (const h of (remote.highlights || [])) if (!deletedSet.has(h.bookId)) hlMap.set(h.id, h)
  for (const h of (local.highlights || [])) if (!deletedSet.has(h.bookId)) hlMap.set(h.id, h)

  const bmMap = new Map()
  for (const b of (remote.bookmarks || [])) if (!deletedSet.has(b.bookId)) bmMap.set(b.id, b)
  for (const b of (local.bookmarks || [])) if (!deletedSet.has(b.bookId)) bmMap.set(b.id, b)

  // Positions: latest timestamp wins per book, skip deleted.
  const positions = { ...(remote.positions || {}) }
  for (const id of deletedSet) delete positions[id]
  for (const [bookId, pos] of Object.entries(local.positions || {})) {
    const remotePos = positions[bookId]
    const localTime = pos?.at || pos?.timestamp || 0
    const remoteTime = remotePos?.at || remotePos?.timestamp || 0
    if (!remotePos || localTime >= remoteTime) {
      positions[bookId] = pos
    }
  }

  // Settings: remote wins (last-sync-wins).
  const settings = remote.settings || local.settings

  // Reading log: merge days, latest seconds per day.
  const days = { ...(remote.readingLog?.days || {}) }
  for (const [key, day] of Object.entries(local.readingLog?.days || {})) {
    const remoteDay = days[key]
    if (!remoteDay || (day.seconds || 0) > (remoteDay.seconds || 0)) {
      days[key] = day
    }
  }

  // Gemini key: only merge if local has it enabled.
  const result = {
    books: Array.from(bookMap.values()),
    blobs,
    positions,
    deletedBookIds: Array.from(deletedSet),
    settings,
    highlights: Array.from(hlMap.values()),
    bookmarks: Array.from(bmMap.values()),
    readingLog: { days }
  }

  if (local.geminiKey) {
    result.geminiKey = local.geminiKey
    result.geminiModel = local.geminiModel
    result.targetLang = local.targetLang
    result.secondLang = local.secondLang
  } else if (remote.geminiKey) {
    result.geminiKey = remote.geminiKey
    result.geminiModel = remote.geminiModel
    result.targetLang = remote.targetLang
    result.secondLang = remote.secondLang
  }

  return result
}

// ---- Restore merged data to local storage ---------------------------------

export async function restoreSyncData(data) {
  if (!data) return

  // Restore book metadata.
  if (data.books) {
    for (const b of data.books) await putBook(b)
  }

  // Restore book file blobs.
  if (data.blobs) {
    for (const [bookId, blob] of Object.entries(data.blobs)) {
      if (blob?.data) {
        await putBlob(bookId, base64ToBuffer(blob.data), blob.type)
      }
    }
  }

  // Restore highlights.
  if (data.highlights) {
    for (const h of data.highlights) await highlights.put(h)
  }

  // Restore bookmarks.
  if (data.bookmarks) {
    for (const b of data.bookmarks) await bookmarks.put(b)
  }

  // Restore positions.
  if (data.positions) {
    for (const [bookId, pos] of Object.entries(data.positions)) {
      try { localStorage.setItem(`br.pos.${bookId}`, JSON.stringify(pos)) } catch { /* skip */ }
    }
  }

  // Restore reading log.
  if (data.readingLog) {
    try { localStorage.setItem('br.reading.log', JSON.stringify(data.readingLog)) } catch { /* skip */ }
  }

  // Restore settings.
  if (data.settings) {
    try { localStorage.setItem('br.settings', JSON.stringify(data.settings)) } catch { /* skip */ }
  }

  // Restore Gemini key (if synced).
  if (data.geminiKey) {
    try { localStorage.setItem('br.gemini.key', data.geminiKey) } catch { /* skip */ }
  }
  if (data.geminiModel) {
    try { localStorage.setItem('br.gemini.model', JSON.stringify(data.geminiModel)) } catch { /* skip */ }
  }
  if (data.targetLang) {
    try { localStorage.setItem('br.translate.lang', JSON.stringify(data.targetLang)) } catch { /* skip */ }
  }
  if (data.secondLang) {
    try { localStorage.setItem('br.translate.lang2', JSON.stringify(data.secondLang)) } catch { /* skip */ }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('br-sync-restored'))
  }
}

// ---- High-level sync operations -------------------------------------------

/**
 * Full sync: collect local data, pull remote, merge, push, restore.
 * Returns { action: 'uploaded'|'downloaded'|'merged'|'up-to-date', deviceCount? }
 */
export async function sync(passphrase, options = {}) {
  if (!_accessToken) throw new Error('Not connected to Google Drive.')
  if (!passphrase) throw new Error('Encryption passphrase is required.')

  const localData = await collectSyncData(options)
  const file = await findSyncFile()

  if (!file) {
    // No remote file yet — encrypt and upload local data.
    const payload = { version: 1, lastSyncAt: Date.now(), data: localData }
    const encrypted = await encrypt(passphrase, JSON.stringify(payload))
    const fileId = await uploadFile(JSON.stringify(encrypted))
    _recordBlobSizes(localData.books)
    _clearDeletedBookIds()
    _recordSyncTime()
    return { action: 'uploaded', fileId }
  }

  // Remote file exists — download, decrypt, merge, re-upload.
  const raw = await downloadFile(file.id)
  let remotePayload
  try {
    const encrypted = JSON.parse(raw)
    const decrypted = await decrypt(passphrase, encrypted)
    remotePayload = JSON.parse(decrypted)
  } catch (err) {
    throw new Error('Wrong passphrase or corrupted sync file. Please check your passphrase.')
  }

  const remoteData = remotePayload?.data || {}
  const merged = mergeSyncData(localData, remoteData)

  // Restore merged data locally.
  await restoreSyncData(merged)

  // Upload merged result.
  const payload = { version: 1, lastSyncAt: Date.now(), data: merged }
  const encrypted = await encrypt(passphrase, JSON.stringify(payload))
  await uploadFile(JSON.stringify(encrypted), file.id)

  _recordBlobSizes(merged.books)
  _clearDeletedBookIds()
  _recordSyncTime()
  return { action: 'merged' }
}

/**
 * Download-only: pull remote data and restore locally (no push).
 */
export async function pull(passphrase) {
  if (!_accessToken) throw new Error('Not connected to Google Drive.')
  if (!passphrase) throw new Error('Encryption passphrase is required.')

  const file = await findSyncFile()
  if (!file) return { action: 'nothing-to-pull' }

  const raw = await downloadFile(file.id)
  let remotePayload
  try {
    const encrypted = JSON.parse(raw)
    const decrypted = await decrypt(passphrase, encrypted)
    remotePayload = JSON.parse(decrypted)
  } catch (err) {
    throw new Error('Wrong passphrase or corrupted sync file.')
  }

  await restoreSyncData(remotePayload?.data || {})
  _recordSyncTime()
  return { action: 'downloaded' }
}

/**
 * Upload-only: push local data to Drive (no pull/merge).
 */
export async function push(passphrase, options = {}) {
  if (!_accessToken) throw new Error('Not connected to Google Drive.')
  if (!passphrase) throw new Error('Encryption passphrase is required.')

  const localData = await collectSyncData(options)
  const file = await findSyncFile()

  const payload = { version: 1, lastSyncAt: Date.now(), data: localData }
  const encrypted = await encrypt(passphrase, JSON.stringify(payload))
  const fileId = await uploadFile(JSON.stringify(encrypted), file?.id)

  _clearDeletedBookIds()
  _recordSyncTime()
  return { action: 'uploaded', fileId }
}

/**
 * Delete the sync file from Drive and disconnect.
 */
export async function deleteSyncFile() {
  if (!_accessToken) throw new Error('Not connected to Google Drive.')
  const file = await findSyncFile()
  if (file) {
    const res = await driveFetch(`${DRIVE_API}/files/${file.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete sync file from Google Drive.')
  }
  disconnect()
}
