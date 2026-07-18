import { useEffect, useRef } from 'react'
import { useSettings } from '../../context/SettingsContext.jsx'
import { clamp } from '../../lib/util.js'

const THEMES = [
  { id: 'light', label: 'Light', bg: '#faf9f7', fg: '#1a1a1a' },
  { id: 'sepia', label: 'Sepia', bg: '#f4ecd8', fg: '#4a3b2a' },
  { id: 'dark', label: 'Dark', bg: '#15171c', fg: '#d7d9de' },
  { id: 'amoled', label: 'Night', bg: '#000000', fg: '#c7c9ce' }
]

const FONTS = [
  { id: 'serif', label: 'Serif', sample: 'Georgia, serif' },
  { id: 'sans', label: 'Sans', sample: 'system-ui, sans-serif' },
  { id: 'dyslexic', label: 'Dyslexic', sample: '"OpenDyslexic", "Comic Sans MS", sans-serif' },
  { id: 'mono', label: 'Mono', sample: 'Consolas, monospace' }
]

// Floating typography & theme panel. Format-aware: EPUB reflows, so it gets the
// full set; PDF is fixed-layout, so it gets theme + zoom (font/spacing/align
// can't apply to pre-laid-out pages — explained inline instead of failing silently).
export default function TypographyPanel({ onClose, format = 'epub' }) {
  const { settings, update } = useSettings()
  const isPdf = format === 'pdf'
  const panelRef = useRef(null)

  // Close on outside click / Escape (the toolbar toggle button is excluded so
  // its own toggle handler doesn't immediately re-open the panel).
  useEffect(() => {
    const onDoc = (e) => {
      if (panelRef.current?.contains(e.target)) return
      if (e.target.closest?.('[aria-label="Text & theme"]')) return
      onClose?.()
    }
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="type-panel" role="dialog" aria-label="Text and theme settings" ref={panelRef}>
      <div className="type-panel__row type-panel__themes">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={`theme-swatch ${settings.theme === t.id ? 'active' : ''}`}
            style={{ background: t.bg, color: t.fg }}
            onClick={() => update({ theme: t.id })}
            aria-pressed={settings.theme === t.id}
          >
            Aa<span>{t.label}</span>
          </button>
        ))}
      </div>

      <hr className="divider" />

      {isPdf ? (
        <>
          <div className="type-panel__row">
            <span className="type-panel__label">Zoom</span>
            <div className="stepper">
              <button className="btn btn--sm" onClick={() => update((s) => ({ pdfZoom: clamp((s.pdfZoom || 100) - 10, 50, 300) }))} aria-label="Zoom out">−</button>
              <span className="stepper__value">{settings.pdfZoom || 100}%</span>
              <button className="btn btn--sm" onClick={() => update((s) => ({ pdfZoom: clamp((s.pdfZoom || 100) + 10, 50, 300) }))} aria-label="Zoom in">+</button>
            </div>
          </div>
          <div className="type-panel__row">
            <span className="type-panel__label">Margins</span>
            <input
              type="range" min="0" max="20" step="1" value={settings.margin}
              onChange={(e) => update({ margin: Number(e.target.value) })}
              aria-label="Side margins"
            />
          </div>
          <p className="type-panel__note">
            PDF pages have a fixed layout, so font, spacing and alignment can’t be
            changed — use zoom instead. (EPUB books support full text controls.)
          </p>
        </>
      ) : (
        <>
          <div className="type-panel__row">
            <span className="type-panel__label">Size</span>
            <div className="stepper">
              <button className="btn btn--sm" onClick={() => update((s) => ({ fontSize: clamp(s.fontSize - 10, 60, 220) }))} aria-label="Smaller text">A−</button>
              <span className="stepper__value">{settings.fontSize}%</span>
              <button className="btn btn--sm" onClick={() => update((s) => ({ fontSize: clamp(s.fontSize + 10, 60, 220) }))} aria-label="Larger text">A+</button>
            </div>
          </div>

          <div className="type-panel__row">
            <span className="type-panel__label">Font</span>
            <div className="font-options">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  className={`font-option ${settings.fontFamily === f.id ? 'active' : ''}`}
                  style={{ fontFamily: f.sample }}
                  onClick={() => update({ fontFamily: f.id })}
                >
                  Ag<span>{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="type-panel__row">
            <span className="type-panel__label">Spacing</span>
            <input
              type="range" min="1.2" max="2.2" step="0.1" value={settings.lineHeight}
              onChange={(e) => update({ lineHeight: Number(e.target.value) })}
              aria-label="Line spacing"
            />
          </div>

          <div className="type-panel__row">
            <span className="type-panel__label">Margins</span>
            <input
              type="range" min="0" max="20" step="1" value={settings.margin}
              onChange={(e) => update({ margin: Number(e.target.value) })}
              aria-label="Page margins"
            />
          </div>

          <div className="type-panel__row">
            <span className="type-panel__label">Align</span>
            <div className="seg">
              <button className={settings.textAlign === 'left' ? 'active' : ''} onClick={() => update({ textAlign: 'left' })}>Left</button>
              <button className={settings.textAlign === 'justify' ? 'active' : ''} onClick={() => update({ textAlign: 'justify' })}>Justify</button>
            </div>
          </div>

          <div className="type-panel__row">
            <span className="type-panel__label">Layout</span>
            <div className="seg">
              <button
                className={settings.flow.epub === 'paginated' ? 'active' : ''}
                onClick={() => update((s) => ({ flow: { ...s.flow, epub: 'paginated' } }))}
              >
                Pages
              </button>
              <button
                className={settings.flow.epub === 'scrolled' ? 'active' : ''}
                onClick={() => update((s) => ({ flow: { ...s.flow, epub: 'scrolled' } }))}
              >
                Scroll
              </button>
            </div>
          </div>

          {settings.flow.epub !== 'scrolled' && (
            <div className="type-panel__row">
              <span className="type-panel__label">Turn</span>
              <div className="seg">
                {['slide', 'fade', 'none'].map((t) => (
                  <button key={t} className={settings.pageTransition === t ? 'active' : ''} onClick={() => update({ pageTransition: t })}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
