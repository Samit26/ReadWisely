// Small key/value persistence in localStorage: user settings, reading positions,
// and the user's own Gemini API key. Nothing here ever leaves the browser.

const KEYS = {
  settings: 'br.settings',
  position: (bookId) => `br.pos.${bookId}`,
  geminiKey: 'br.gemini.key',
  geminiModel: 'br.gemini.model',
  targetLang: 'br.translate.lang',
  secondLang: 'br.translate.lang2',
  readingLog: 'br.reading.log'
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    // Quota errors here are rare (small payloads) but never throw into the UI.
    console.warn('localStorage write failed', err)
  }
}

// ---- Settings -------------------------------------------------------------

export const DEFAULT_SETTINGS = {
  theme: 'sepia', // light | dark | sepia | amoled
  fontSize: 100, // percent (epub reflow)
  pdfZoom: 100, // percent (pdf page width/zoom, re-rendered)
  fontFamily: 'serif', // serif | sans | dyslexic | mono
  lineHeight: 1.6,
  margin: 8, // percent of viewport width, per side
  textAlign: 'justify', // justify | left
  flow: { epub: 'paginated', pdf: 'scrolled' }, // render strategy per format
  pageTransition: 'slide' // slide | fade | none
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) }
}

export function saveSettings(settings) {
  write(KEYS.settings, settings)
}

// ---- Reading position ------------------------------------------------------

export function loadPosition(bookId) {
  return read(KEYS.position(bookId), null)
}

export function savePosition(bookId, position) {
  write(KEYS.position(bookId), position)
}

export function clearPosition(bookId) {
  try {
    localStorage.removeItem(KEYS.position(bookId))
  } catch {
    // ignore
  }
}

// ---- Gemini (BYOK) ---------------------------------------------------------

export function getGeminiKey() {
  try {
    return localStorage.getItem(KEYS.geminiKey) || ''
  } catch {
    return ''
  }
}

export function setGeminiKey(key) {
  try {
    if (key) localStorage.setItem(KEYS.geminiKey, key)
    else localStorage.removeItem(KEYS.geminiKey)
  } catch (err) {
    console.warn('Could not store Gemini key', err)
  }
}

export function getGeminiModel() {
  const model = read(KEYS.geminiModel, 'gemini-3.5-flash')
  // Migrate away from retired model ids saved by earlier versions.
  return LEGACY_MODELS.has(model) ? 'gemini-3.5-flash' : model
}

const LEGACY_MODELS = new Set(['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'])

export function setGeminiModel(model) {
  write(KEYS.geminiModel, model)
}

export function getTargetLang() {
  return read(KEYS.targetLang, 'English')
}

export function setTargetLang(lang) {
  write(KEYS.targetLang, lang)
}

// Secondary language: when the selected text is already in the target language,
// we show its equivalent/gloss in this language instead of echoing it back.
export function getSecondLang() {
  return read(KEYS.secondLang, 'Hindi')
}

export function setSecondLang(lang) {
  write(KEYS.secondLang, lang)
}

// ---- Reading streak --------------------------------------------------------
// Records seconds read per local calendar day. A day "counts" toward a streak
// once it crosses DAY_THRESHOLD_SECONDS, so merely opening a book doesn't fake it.

export const DAY_THRESHOLD_SECONDS = 120

// Local (not UTC) YYYY-MM-DD so "today" matches the reader's wall clock.
export function dayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function loadReadingLog() {
  const log = read(KEYS.readingLog, null)
  return log && typeof log === 'object' && log.days ? log : { days: {} }
}

// Add active reading time to today's bucket. Returns the updated log.
export function recordReadingSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return loadReadingLog()
  const log = loadReadingLog()
  const key = dayKey()
  const day = log.days[key] || { seconds: 0 }
  day.seconds += seconds
  log.days[key] = day
  write(KEYS.readingLog, log)
  return log
}

// Parse a YYYY-MM-DD key back into a local Date at midnight.
function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const MS_PER_DAY = 86400000
function daysBetween(a, b) {
  return Math.round((keyToDate(a) - keyToDate(b)) / MS_PER_DAY)
}

// Derive streak stats + heatmap data from the log.
// A day qualifies once it passes DAY_THRESHOLD_SECONDS.
export function computeStreak(log = loadReadingLog()) {
  const qualified = Object.keys(log.days)
    .filter((k) => (log.days[k]?.seconds || 0) >= DAY_THRESHOLD_SECONDS)
    .sort() // ascending YYYY-MM-DD

  const set = new Set(qualified)
  const today = dayKey()
  const yesterday = dayKey(new Date(Date.now() - MS_PER_DAY))
  const year = new Date().getFullYear()

  // Current streak: consecutive days ending today, or yesterday (grace period).
  let current = 0
  if (set.size) {
    let cursor = set.has(today) ? today : set.has(yesterday) ? yesterday : null
    while (cursor && set.has(cursor)) {
      current++
      cursor = dayKey(new Date(keyToDate(cursor).getTime() - MS_PER_DAY))
    }
  }

  // Longest streak across all history.
  let longest = 0
  let run = 0
  let prev = null
  for (const key of qualified) {
    run = prev && daysBetween(key, prev) === 1 ? run + 1 : 1
    if (run > longest) longest = run
    prev = key
  }

  const thisYear = qualified.filter((k) => k.startsWith(`${year}-`)).length

  return { current, longest, totalDays: qualified.length, thisYear, qualified: set }
}

// Derive at-a-glance reading stats from the time log + the library.
// All numbers come from data we already store — no schema change.
export function computeReadingStats(log = loadReadingLog(), books = []) {
  const days = log.days || {}
  const keys = Object.keys(days)
  const monthPrefix = dayKey().slice(0, 7) // YYYY-MM

  let totalSeconds = 0
  let monthSeconds = 0
  let readingDays = 0
  let bestDaySeconds = 0
  let bestDayKey = null
  const perMonth = {} // "YYYY-MM" -> seconds

  for (const key of keys) {
    const secs = days[key]?.seconds || 0
    if (secs <= 0) continue
    totalSeconds += secs
    if (secs >= DAY_THRESHOLD_SECONDS) readingDays++
    if (key.startsWith(monthPrefix)) monthSeconds += secs
    if (secs > bestDaySeconds) { bestDaySeconds = secs; bestDayKey = key }
    const mk = key.slice(0, 7)
    perMonth[mk] = (perMonth[mk] || 0) + secs
  }

  let bestMonthKey = null
  let bestMonthSeconds = 0
  for (const mk of Object.keys(perMonth)) {
    if (perMonth[mk] > bestMonthSeconds) { bestMonthSeconds = perMonth[mk]; bestMonthKey = mk }
  }

  const finished = books.filter((b) => (b.progress || 0) >= 0.98).length
  const avgMinutes = readingDays ? Math.round(totalSeconds / 60 / readingDays) : 0

  return {
    totalMinutes: Math.round(totalSeconds / 60),
    monthMinutes: Math.round(monthSeconds / 60),
    readingDays,
    avgMinutes,
    bestDayMinutes: Math.round(bestDaySeconds / 60),
    bestDayKey,
    bestMonthKey,
    bestMonthMinutes: Math.round(bestMonthSeconds / 60),
    booksFinished: finished
  }
}
