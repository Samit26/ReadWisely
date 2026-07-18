// Small key/value persistence in localStorage: user settings, reading positions,
// and the user's own Gemini API key. Nothing here ever leaves the browser.

const KEYS = {
  settings: 'br.settings',
  position: (bookId) => `br.pos.${bookId}`,
  geminiKey: 'br.gemini.key',
  geminiModel: 'br.gemini.model',
  targetLang: 'br.translate.lang',
  secondLang: 'br.translate.lang2'
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
