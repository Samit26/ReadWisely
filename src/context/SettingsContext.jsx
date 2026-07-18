import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../lib/storage.js'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings)

  // Persist + reflect theme/typography onto the document via CSS variables.
  useEffect(() => {
    saveSettings(settings)
    const root = document.documentElement
    root.dataset.theme = settings.theme
    root.style.setProperty('--reader-font-scale', settings.fontSize / 100)
    root.style.setProperty('--reader-line-height', settings.lineHeight)
    root.style.setProperty('--reader-margin', `${settings.margin}%`)
    root.style.setProperty('--reader-text-align', settings.textAlign)
    root.style.setProperty('--reader-font-family', FONT_STACKS[settings.fontFamily] || FONT_STACKS.serif)
    const themeColor = THEME_META[settings.theme] || THEME_META.dark
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor)
  }, [settings])

  const update = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
  }, [])

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), [])

  return (
    <SettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}

export const FONT_STACKS = {
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  sans: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  dyslexic: '"OpenDyslexic", "Comic Sans MS", "Segoe UI", sans-serif',
  mono: '"SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace'
}

const THEME_META = {
  light: '#faf9f7',
  dark: '#0f1115',
  sepia: '#f4ecd8',
  amoled: '#000000'
}
