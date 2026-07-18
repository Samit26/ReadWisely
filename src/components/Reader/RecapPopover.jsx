import { useState, useEffect } from 'react'
import { recapReading, hasGeminiKey, GeminiError } from '../../lib/gemini.js'
import { Icon } from '../common/Icon.jsx'
import SettingsModal from '../Settings/SettingsModal.jsx'

// Spoiler-safe "where I left off" recap. On open, offers two scopes:
//   recent — current + previous chapter (fast, cheap)
//   all    — the whole story so far (uses Gemini's large context window)
// Pulls the read text from the engine, sends it to Gemini, and shows a calm
// summary. Mirrors TranslatePopover's explicit handling of every failure mode.
const CAPS = { recent: 15000, all: 600000 }

export default function RecapPopover({ engine, onClose }) {
  const [state, setState] = useState('choose') // choose | loading | empty | done | error | no-key
  const [scope, setScope] = useState('recent')
  const [result, setResult] = useState(null)
  const [errorKind, setErrorKind] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  const run = (chosen = scope) => {
    setScope(chosen)
    if (!hasGeminiKey()) { setState('no-key'); return }
    setState('loading')
    const controller = new AbortController()
    ;(async () => {
      try {
        const text = await engine?.getReadText?.({ maxChars: CAPS[chosen] || CAPS.recent, scope: chosen })
        if (!text || text.trim().length < 200) { setState('empty'); return }
        const out = await recapReading(text, { scope: chosen, signal: controller.signal })
        setResult(out)
        setState('done')
      } catch (err) {
        if (err?.name === 'AbortError') return
        setErrorKind(err instanceof GeminiError ? err.kind : 'unknown')
        setErrorMsg(err?.message || 'Could not build a recap.')
        setState('error')
      }
    })()
    return () => controller.abort()
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="translate-scrim" onMouseDown={onClose} />
      <div className="recap-pop" role="dialog" aria-label="Recap">
        <div className="recap-pop__head">
          <span className="recap-pop__title"><Icon.Recap width={16} height={16} /> Where you left off</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.Close width={18} height={18} /></button>
        </div>
        <hr className="divider" />

        <div className="recap-pop__body">
          {state === 'choose' && (
            <div className="recap-pop__choose">
              <button className="recap-choice" onClick={() => run('recent')}>
                <strong>Recent chapters</strong>
                <span className="muted">A quick recap of the current chapter and the one before it.</span>
              </button>
              <button className="recap-choice" onClick={() => run('all')}>
                <strong>From the start</strong>
                <span className="muted">Recap the whole story up to here. Reads more, takes a little longer.</span>
              </button>
            </div>
          )}

          {state === 'loading' && (
            <div className="recap-pop__loading">
              <div className="spinner" /> {scope === 'all' ? 'Reading the story so far…' : 'Gathering the threads…'}
            </div>
          )}

          {state === 'empty' && (
            <p className="muted">There isn’t enough read yet to recap. Read a little further and try again.</p>
          )}

          {state === 'done' && result && (
            <div className="recap-pop__result">
              <p className="recap-pop__recap">{result.recap}</p>
              {result.lastBeat && (
                <div className="recap-pop__field">
                  <span className="recap-pop__flabel">Right before you stopped</span>
                  <p>{result.lastBeat}</p>
                </div>
              )}
              <p className="recap-pop__note muted">
                A spoiler-safe recap {scope === 'all' ? 'of the story so far' : 'of the last pages you read'}.
                <button className="recap-pop__again" onClick={() => setState('choose')}>Recap differently</button>
              </p>
            </div>
          )}

          {state === 'no-key' && (
            <div className="recap-pop__notice">
              <p><strong>Add your Gemini key for recaps.</strong></p>
              <p className="muted">
                This reader has no server, so there’s no shared key — you bring your own (free from Google AI Studio).
                It’s stored only in this browser and used to call Google directly.
              </p>
              <button className="btn btn--primary btn--sm" onClick={() => setShowSettings(true)}>Add API key</button>
            </div>
          )}

          {state === 'error' && (
            <div className="recap-pop__error">
              <p>{errorMsg}</p>
              {errorKind === 'invalid-key' && (
                <button className="btn btn--sm" onClick={() => setShowSettings(true)}>Fix key in Settings</button>
              )}
              {(errorKind === 'network' || errorKind === 'rate-limit' || errorKind === 'unknown') && (
                <button className="btn btn--sm" onClick={() => run(scope)}>Retry</button>
              )}
            </div>
          )}
        </div>
      </div>
      {showSettings && (
        <SettingsModal onClose={() => { setShowSettings(false); if (hasGeminiKey()) run(scope) }} />
      )}
    </>
  )
}
