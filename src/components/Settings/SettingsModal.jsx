import { useState } from 'react'
import Modal from '../common/Modal.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { useSettings } from '../../context/SettingsContext.jsx'
import {
  getGeminiKey, setGeminiKey, getGeminiModel, setGeminiModel,
  getTargetLang, setTargetLang, getSecondLang, setSecondLang
} from '../../lib/storage.js'
import { validateKey } from '../../lib/gemini.js'
import { Icon } from '../common/Icon.jsx'
import SyncSettings from './SyncSettings.jsx'

const MODELS = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (fast, recommended)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (fastest, cheapest)' }
]

const THEMES = [
  { id: 'light', label: 'Light', bg: '#faf9f7', fg: '#1a1a1a' },
  { id: 'sepia', label: 'Sepia', bg: '#f4ecd8', fg: '#4a3b2a' },
  { id: 'dark', label: 'Dark', bg: '#15171c', fg: '#d7d9de' },
  { id: 'amoled', label: 'Night', bg: '#000000', fg: '#c7c9ce' }
]

const LANGS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Hindi', 'Urdu', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Arabic', 'Chinese (Simplified)', 'Japanese', 'Korean', 'Russian', 'Turkish', 'Indonesian', 'Vietnamese']

// Settings modal. Focus of the brief: BYOK Gemini onboarding with a clear "why".
export default function SettingsModal({ onClose, initialTab = 'translate' }) {
  const toast = useToast()
  const { settings, update } = useSettings()
  const [key, setKey] = useState(getGeminiKey())
  const [model, setModel] = useState(getGeminiModel())
  const [lang, setLang] = useState(getTargetLang())
  const [lang2, setLang2] = useState(getSecondLang())
  const [showKey, setShowKey] = useState(false)
  const [checking, setChecking] = useState(false)

  const save = () => {
    setGeminiKey(key.trim())
    setGeminiModel(model)
    setTargetLang(lang)
    setSecondLang(lang2)
    toast.success('Settings saved.')
    onClose()
  }

  const test = async () => {
    if (!key.trim()) { toast.error('Enter a key first.'); return }
    setChecking(true)
    const res = await validateKey(key.trim(), model)
    setChecking(false)
    if (res.ok) toast.success('Key works! 🎉')
    else toast.error(res.message || 'Key check failed.')
  }

  return (
    <Modal
      title="Settings"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={save}>Save</button>
        </>
      }
    >
      <section className="settings-section">
        <h3 className="settings-h"><Icon.Sun width={18} height={18} /> Appearance</h3>
        <p className="field__hint muted" style={{ marginTop: 0 }}>Choose a theme for the whole app. Applies instantly.</p>
        <div className="settings-themes">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-swatch ${settings.theme === t.id ? 'active' : ''}`}
              style={{ background: t.bg, color: t.fg }}
              onClick={() => update({ theme: t.id })}
              aria-pressed={settings.theme === t.id}
            >
              Aa<span>{t.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-h"><Icon.Translate width={18} height={18} /> Gemini translation (BYOK)</h3>
        <div className="byok-note">
          <p>
            There’s <strong>no server</strong> behind this app, so there’s no shared API key.
            You bring your own <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio key</a>,
            and translation requests go <strong>directly from your browser to Google</strong> — never through us.
          </p>
          <p className="muted">
            Your key is stored only in this browser’s localStorage. It’s visible in your own devtools/network tab
            (that’s normal for BYOK). <strong>Never share or reuse this key on a device you don’t trust.</strong>
          </p>
        </div>

        <label className="field">
          <span className="field__label">API key</span>
          <div className="field__key">
            <input
              className="input" type={showKey ? 'text' : 'password'}
              placeholder="AIza…" value={key} onChange={(e) => setKey(e.target.value)}
              autoComplete="off" spellCheck={false}
            />
            <button className="btn btn--sm" type="button" onClick={() => setShowKey((s) => !s)}>
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field__label">Model</span>
            <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Translate into</span>
            <select className="select" value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        </div>

        <label className="field">
          <span className="field__label">Secondary language</span>
          <select className="select" value={lang2} onChange={(e) => setLang2(e.target.value)}>
            {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <span className="field__hint muted">
            When you select text that’s already in {lang}, you’ll get a definition and example instead of an
            echo — plus what it’s called in {lang2}.
          </span>
        </label>

        <div className="field__actions">
          <button className="btn btn--sm" onClick={test} disabled={checking}>
            {checking ? <div className="spinner" /> : null} Test key
          </button>
          {key && (
            <button className="btn btn--sm btn--danger" onClick={() => { setKey(''); setGeminiKey(''); toast.info('Key removed.') }}>
              Remove key
            </button>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-h"><Icon.Upload width={18} height={18} /> Cloud Sync</h3>
        <SyncSettings />
      </section>
    </Modal>
  )
}
