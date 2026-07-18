import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { translateText, hasGeminiKey, GeminiError } from '../../lib/gemini.js'
import { getTargetLang } from '../../lib/storage.js'
import { Icon } from '../common/Icon.jsx'
import SettingsModal from '../Settings/SettingsModal.jsx'

// Shows the Gemini result inline. Two modes:
//  - translation: text was in another language → show translation + meaning
//  - explanation: text was already in the target language → show a definition,
//    an example sentence, and the equivalent in the reader's secondary language
// Handles every failure mode explicitly (no key, invalid key, rate limit, offline).
export default function TranslatePopover({ text, rect, onClose }) {
  const [state, setState] = useState('idle') // idle | loading | done | error | no-key
  const [result, setResult] = useState(null) // structured object from gemini
  const [errorKind, setErrorKind] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const ref = useRef(null)
  const [pos, setPos] = useState({ opacity: 0 })
  const targetLang = getTargetLang()

  const run = () => {
    if (!hasGeminiKey()) { setState('no-key'); return }
    setState('loading')
    const controller = new AbortController()
    translateText(text, { signal: controller.signal })
      .then((out) => { setResult(out); setState('done') })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setErrorKind(err instanceof GeminiError ? err.kind : 'unknown')
        setErrorMsg(err.message || 'Translation failed.')
        setState('error')
      })
    return () => controller.abort()
  }

  useEffect(() => {
    const cleanup = run()
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  // Position near the selection, clamped to viewport.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const pad = 10
    let left = rect ? rect.left + rect.width / 2 - w / 2 : window.innerWidth / 2 - w / 2
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad))
    let top = rect ? rect.bottom + 12 : 100
    if (top + h > window.innerHeight - pad) top = Math.max(pad, (rect?.top ?? 100) - h - 12)
    setPos({ left, top, opacity: 1 })
  }, [rect, state, result])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isExplain = result?.mode === 'explanation'
  const headLabel = state === 'done'
    ? (isExplain ? `Meaning · ${targetLang}` : `Translate → ${result?.targetLang || targetLang}`)
    : `Translate → ${targetLang}`

  // Copyable plain-text version of whatever we're showing.
  const copyText = () => {
    if (!result) return ''
    if (result.mode === 'translation') {
      return [result.translation, result.explanation && `(${result.explanation})`, result.secondary && `${result.secondLang}: ${result.secondary}`]
        .filter(Boolean).join('\n')
    }
    return [result.explanation, result.example && `e.g. ${result.example}`, result.secondary && `${result.secondLang}: ${result.secondary}`]
      .filter(Boolean).join('\n')
  }

  return (
    <>
      <div className="translate-scrim" onMouseDown={onClose} />
      <div className="translate-pop" ref={ref} style={pos} role="dialog" aria-label="Translation">
        <div className="translate-pop__head">
          <span className="translate-pop__title"><Icon.Translate width={16} height={16} /> {headLabel}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.Close width={18} height={18} /></button>
        </div>

        <div className="translate-pop__source">
          “{text.length > 220 ? text.slice(0, 220) + '…' : text}”
          {result?.partOfSpeech && <span className="translate-pop__pos">{result.partOfSpeech}</span>}
        </div>
        <hr className="divider" />

        <div className="translate-pop__body">
          {state === 'loading' && <div className="translate-pop__loading"><div className="spinner" /> Thinking…</div>}

          {state === 'done' && result && (
            <div className="translate-pop__result">
              {result.mode === 'translation' ? (
                <>
                  <p className="translate-pop__primary">{result.translation}</p>
                  {result.detectedLanguage && (
                    <p className="translate-pop__from muted">from {result.detectedLanguage}</p>
                  )}
                  {result.explanation && (
                    <div className="translate-pop__field">
                      <span className="translate-pop__flabel">Meaning</span>
                      <p>{result.explanation}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {result.explanation && (
                    <div className="translate-pop__field">
                      <span className="translate-pop__flabel">Definition</span>
                      <p>{result.explanation}</p>
                    </div>
                  )}
                  {result.example && (
                    <div className="translate-pop__field">
                      <span className="translate-pop__flabel">Example</span>
                      <p className="translate-pop__example">“{result.example}”</p>
                    </div>
                  )}
                </>
              )}

              {result.secondary && (
                <div className="translate-pop__field translate-pop__secondary">
                  <span className="translate-pop__flabel">In {result.secondLang}</span>
                  <p>{result.secondary}</p>
                </div>
              )}

              <button className="btn btn--sm translate-pop__copy" onClick={() => navigator.clipboard?.writeText(copyText())}>
                <Icon.Copy width={14} height={14} /> Copy
              </button>
            </div>
          )}

          {state === 'no-key' && (
            <div className="translate-pop__notice">
              <p><strong>Add your Gemini key to translate.</strong></p>
              <p className="muted">
                This reader has no server, so there’s no shared key — you bring your own (free from Google AI Studio).
                It’s stored only in this browser and used to call Google directly.
              </p>
              <button className="btn btn--primary btn--sm" onClick={() => setShowSettings(true)}>Add API key</button>
            </div>
          )}

          {state === 'error' && (
            <div className="translate-pop__error">
              <p>{errorMsg}</p>
              {(errorKind === 'invalid-key') && (
                <button className="btn btn--sm" onClick={() => setShowSettings(true)}>Fix key in Settings</button>
              )}
              {(errorKind === 'network' || errorKind === 'rate-limit' || errorKind === 'unknown') && (
                <button className="btn btn--sm" onClick={run}>Retry</button>
              )}
            </div>
          )}
        </div>
      </div>
      {showSettings && (
        <SettingsModal onClose={() => { setShowSettings(false); if (hasGeminiKey()) run() }} />
      )}
    </>
  )
}
