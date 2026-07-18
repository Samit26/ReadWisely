// BYOK Gemini translation. The user's key is read from localStorage and sent
// ONLY to Google's endpoint, directly from the browser. Nothing touches a server
// of ours (there is no server). The key is visible in the user's own devtools —
// that's expected for BYOK; UI copy warns never to share/reuse the key.

import { getGeminiKey, getGeminiModel, getTargetLang, getSecondLang } from './storage.js'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export class GeminiError extends Error {
  constructor(message, kind) {
    super(message)
    this.name = 'GeminiError'
    this.kind = kind // 'no-key' | 'invalid-key' | 'rate-limit' | 'network' | 'blocked' | 'unknown'
  }
}

export function hasGeminiKey() {
  return Boolean(getGeminiKey())
}

// Structured schema so the model reliably returns either a translation OR a
// dictionary-style explanation (used when the text is already in the target
// language, so echoing it back would be useless).
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['translation', 'explanation'] },
    detectedLanguage: { type: 'string' },
    translation: { type: 'string' },
    explanation: { type: 'string' },
    example: { type: 'string' },
    secondary: { type: 'string' },
    partOfSpeech: { type: 'string' }
  },
  required: ['mode']
}

function buildPrompt(text, targetLang, secondLang) {
  return (
    `You are a reading assistant helping a reader understand selected text.\n` +
    `The reader's primary language is ${targetLang}. Their secondary language is ${secondLang}.\n\n` +
    `Selected text:\n"""${text}"""\n\n` +
    `Decide:\n` +
    `- If the selected text is NOT in ${targetLang}, set mode="translation": provide "translation" ` +
    `(a natural ${targetLang} translation) and "detectedLanguage" (the source language). Also include a short ` +
    `"explanation" of the meaning in ${targetLang}, and "secondary" = the meaning/equivalent in ${secondLang}.\n` +
    `- If the selected text IS already in ${targetLang}, set mode="explanation": DO NOT just repeat it. Provide ` +
    `"explanation" (a clear, concise definition/meaning in ${targetLang}), "example" (one natural example sentence ` +
    `using it), "partOfSpeech" if it's a single word, and "secondary" = what it is called / its equivalent in ${secondLang} ` +
    `(include the ${secondLang} script and, if useful, a romanization).\n\n` +
    `Keep it concise. Respond as JSON only.`
  )
}

// Shared POST to generateContent with a structured-output schema. Returns the
// raw JSON text from the first candidate. Throws GeminiError on failure.
async function generateJson(prompt, schema, opts = {}) {
  const key = getGeminiKey()
  if (!key) throw new GeminiError('No Gemini API key set.', 'no-key')

  const model = opts.model || getGeminiModel()
  const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  }

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new GeminiError('Network error — check your internet connection.', 'network')
  }

  if (!res.ok) {
    let detail = ''
    try {
      const data = await res.json()
      detail = data?.error?.message || ''
    } catch { /* ignore parse error */ }

    if (res.status === 400 && /api key not valid/i.test(detail)) {
      throw new GeminiError('That API key was rejected. Double-check it in Settings.', 'invalid-key')
    }
    if (res.status === 401 || res.status === 403) {
      throw new GeminiError('Key invalid or lacking access to this model.', 'invalid-key')
    }
    if (res.status === 429) {
      throw new GeminiError('Rate limit reached. Wait a moment and try again.', 'rate-limit')
    }
    throw new GeminiError(detail || `Request failed (${res.status}).`, 'unknown')
  }

  const data = await res.json()
  if (data?.promptFeedback?.blockReason) {
    throw new GeminiError('The request was blocked by Gemini safety filters.', 'blocked')
  }
  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
  if (!raw.trim()) throw new GeminiError('Empty response from Gemini.', 'unknown')
  return raw
}

// Translate/explain `text`. Returns a structured object:
//   { mode, translation?, detectedLanguage?, explanation?, example?, secondary?, partOfSpeech?,
//     targetLang, secondLang }
// Throws GeminiError with a typed `kind` on failure (Phase 4: never silent).
export async function translateText(text, opts = {}) {
  const targetLang = opts.targetLang || getTargetLang()
  const secondLang = opts.secondLang || getSecondLang()
  const raw = await generateJson(buildPrompt(text, targetLang, secondLang), RESPONSE_SCHEMA, opts)

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Model ignored the schema (rare) — fall back to treating the text as a plain
    // translation so the user still gets something useful.
    parsed = { mode: 'translation', translation: raw.trim() }
  }
  return { ...parsed, targetLang, secondLang }
}

// ---- Reading recap ---------------------------------------------------------

const RECAP_SCHEMA = {
  type: 'object',
  properties: {
    recap: { type: 'string' },
    lastBeat: { type: 'string' }
  },
  required: ['recap']
}

// Spoiler-safe recap of the text the reader has already passed through. `text`
// ends exactly where the reader stopped. scope='recent' recaps just the given
// passage; scope='all' recaps the whole story so far. We always instruct the
// model to summarize ONLY the supplied text and never speculate about what's ahead.
export async function recapReading(text, opts = {}) {
  const lang = opts.targetLang || getTargetLang()
  const all = opts.scope === 'all'
  const recapSentences = all ? '4–7 short sentences' : '2–4 short sentences'
  const passageLabel = all
    ? `Below is EVERYTHING the reader has read so far, from the start up to where they stopped.`
    : `Below is the passage the reader has MOST RECENTLY read (it ends exactly where they stopped).`
  const recapAsk = all
    ? `Write a warm, spoiler-safe recap in ${lang} of the story so far — the main arc up to this point.`
    : `Write a warm, spoiler-safe recap in ${lang} of what happened in THIS passage only.`

  const prompt =
    `You are a reading companion helping someone pick a book back up.\n` +
    `${passageLabel}\n` +
    `${recapAsk}\n` +
    `Rules:\n` +
    `- Summarize ONLY the text given. Never invent or predict what comes next.\n` +
    `- ${recapSentences} for "recap": the key events/ideas, so they remember where they are.\n` +
    `- "lastBeat": one sentence describing the very last thing happening as the text ends.\n` +
    `- Keep a calm, literary tone. No headings, no bullet points.\n\n` +
    `Text:\n"""${text}"""\n\n` +
    `Respond as JSON only.`

  const raw = await generateJson(prompt, RECAP_SCHEMA, { ...opts, temperature: 0.3 })
  try {
    const parsed = JSON.parse(raw)
    return { recap: parsed.recap || '', lastBeat: parsed.lastBeat || '' }
  } catch {
    return { recap: raw.trim(), lastBeat: '' }
  }
}

// ---- Author lookup ---------------------------------------------------------
const AUTHOR_SCHEMA = {
  type: 'object',
  properties: {
    known: { type: 'boolean' },
    author: { type: 'string' }
  },
  required: ['known']
}

// Ask Gemini who wrote a book, given its title (often a filename). Returns the
// author name, or '' when the model isn't confident. Throws GeminiError on
// API failure — callers treat this as best-effort and stay silent.
export async function guessAuthor(title, opts = {}) {
  const prompt =
    `Given this book title (it may be a raw filename):\n"""${title}"""\n\n` +
    `If you are confident you know this published book and its author, set known=true ` +
    `and author to the author's full name (e.g. "Jane Austen"). If you are not sure, ` +
    `or it looks like a personal document, report, or unknown title, set known=false. ` +
    `Do not guess. Respond as JSON only.`

  const raw = await generateJson(prompt, AUTHOR_SCHEMA, { ...opts, temperature: 0 })
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return ''
  }
  const author = (parsed?.known && parsed?.author) ? String(parsed.author).trim() : ''
  if (!author || author.length > 80 || /unknown|n\/a|various/i.test(author)) return ''
  return author
}

// Lightweight key validation for the onboarding modal.
export async function validateKey(key, model = getGeminiModel()) {
  const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] })
    })
    if (res.ok) return { ok: true }
    const data = await res.json().catch(() => ({}))
    return { ok: false, message: data?.error?.message || `Failed (${res.status})` }
  } catch {
    return { ok: false, message: 'Network error — could not reach Google.' }
  }
}
