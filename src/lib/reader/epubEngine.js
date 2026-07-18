import ePub from 'epubjs'
import { Emitter } from './emitter.js'

// EPUB engine — reflowable text via epub.js. Supports paginated and scrolled flow.
export class EpubEngine extends Emitter {
  constructor(source, opts = {}) {
    super()
    this.format = 'epub'
    this.source = source // ArrayBuffer
    this.book = null
    this.rendition = null
    this._location = null
    this._progress = 0
    this._toc = []
    this._destroyed = false
    this._highlightHandlers = new Map() // id -> cfiRange for removal
  }

  async init(container, { startLocation, settings } = {}) {
    this.book = ePub(this.source)
    this.container = container

    // 'scrolled' + the continuous manager = one uninterrupted scroll across the
    // whole book (scrolled-doc would stop at each chapter boundary).
    const scrolled = settings?.flow?.epub === 'scrolled'
    this._flow = scrolled ? 'scrolled' : 'paginated'
    this.rendition = this.book.renderTo(container, {
      width: '100%',
      height: '100%',
      flow: this._flow,
      manager: scrolled ? 'continuous' : 'default',
      spread: scrolled ? 'none' : 'auto',
      allowScriptedContent: false
    })

    this._registerTheme(settings)
    this.applySettings(settings)

    // Selection -> translate/highlight flow.
    this.rendition.on('selected', (cfiRange, contents) => {
      const text = contents.window.getSelection()?.toString() || ''
      if (text.trim()) {
        const rect = this._selectionRect(contents)
        this.emit('selected', { text, location: cfiRange, rect })
      }
    })

    this.rendition.on('relocated', (loc) => {
      this._location = loc.start.cfi
      if (this.book.locations?.length()) {
        this._progress = this.book.locations.percentageFromCfi(loc.start.cfi) || 0
        const idx = this.book.locations.locationFromCfi(loc.start.cfi)
        this._pageInfo = { current: (typeof idx === 'number' ? idx : 0) + 1, total: this.book.locations.length(), kind: 'loc' }
      } else if (loc.start.percentage != null) {
        this._progress = loc.start.percentage
      }
      this.emit('relocated', { location: this._location, progress: this._progress, pageInfo: this._pageInfo })
    })

    // Clicks/keys happen inside the epub iframe and never reach the host page —
    // relay them so the UI can toggle chrome and page-turn with arrow keys.
    this.rendition.on('click', () => this.emit('tap'))
    this.rendition.on('keydown', (e) => this.emit('keydown', { key: e.key }))

    try {
      await this.book.ready
      this._toc = this._flattenToc(this.book.navigation?.toc || [])
      await this.rendition.display(startLocation || undefined)
      this.emit('loaded', { toc: this._toc })
    } catch (err) {
      this.emit('error', this._friendlyError(err))
      throw err
    }

    // Generate locations in the background for accurate % progress.
    this.book.ready
      .then(() => this.book.locations.generate(1024))
      .then(() => {
        if (this._destroyed) return
        if (this._location) {
          this._progress = this.book.locations.percentageFromCfi(this._location) || 0
          const idx = this.book.locations.locationFromCfi(this._location)
          this._pageInfo = { current: (typeof idx === 'number' ? idx : 0) + 1, total: this.book.locations.length(), kind: 'loc' }
          this.emit('relocated', { location: this._location, progress: this._progress, pageInfo: this._pageInfo })
        }
      })
      .catch(() => { /* locations are a nicety; ignore failures */ })
  }

  _registerTheme(settings) {
    // Re-inject our reader stylesheet into every chapter iframe as it renders.
    this.rendition.hooks.content.register((contents) => {
      this._injectStyles(contents)
    })
  }

  applySettings(settings) {
    if (!this.rendition || !settings) return
    this._lastSettings = settings
    // Update already-rendered chapters in place; the content hook covers new ones.
    this.rendition.getContents?.().forEach((c) => this._injectStyles(c))
  }

  // Books ship their own CSS that styles <p>/<h1>/etc. directly, which beats any
  // inline style epub.js puts on <body> (themes.override). So we inject a real
  // stylesheet with !important rules targeting the text elements themselves —
  // that's the only reliable way for user settings to win over book CSS.
  _injectStyles(contents) {
    const s = this._lastSettings
    if (!s || !contents?.document) return
    const fonts = {
      serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
      sans: '-apple-system, "Segoe UI", Roboto, Helvetica, sans-serif',
      dyslexic: '"OpenDyslexic", "Comic Sans MS", "Segoe UI", sans-serif',
      mono: '"SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace'
    }
    const palette = THEME_COLORS[s.theme] || THEME_COLORS.dark
    const font = fonts[s.fontFamily] || fonts.serif
    const textSelector = 'p, li, blockquote, dd, dt, div, span, a, h1, h2, h3, h4, h5, h6, em, strong, i, b, cite, td, th, caption, figcaption, pre, code'

    const css = `
      html {
        font-size: ${s.fontSize}% !important;
      }
      html, body {
        background: ${palette.bg} !important;
        color: ${palette.text} !important;
      }
      ${textSelector} {
        color: ${palette.text} !important;
        font-family: ${font} !important;
        line-height: ${s.lineHeight} !important;
        background-color: transparent !important;
      }
      p, li, blockquote, dd {
        text-align: ${s.textAlign} !important;
      }
      /* Book font sizes are commonly absolute (pt/px), which would ignore the
         root % size — normalize paragraphs to em so scaling works. */
      p { font-size: 1em !important; }
      a { color: ${palette.link} !important; }
      img, svg, image { max-width: 100% !important; }
      ${this._flow === 'scrolled'
        ? `/* Scrolled flow: show a themed scrollbar (mirrors the PDF scroller). */
      ::-webkit-scrollbar { width: 14px; height: 0; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: ${palette.text}55; border-radius: 10px; border: 4px solid ${palette.bg}; min-height: 48px; }
      ::-webkit-scrollbar-thumb:hover { background: ${palette.text}88; }
      html { scrollbar-width: thin; scrollbar-color: ${palette.text}55 transparent; }`
        : `/* Hide any scrollbars inside the chapter iframe (pagination clips columns). */
      ::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }`}
    `
    try {
      contents.addStylesheetCss(css, 'bookreader-user-settings')
      contents.document.documentElement.style.background = palette.bg
    } catch { /* iframe mid-load; the content hook will re-run on render */ }
  }

  async next() { await this.rendition?.next() }
  async prev() { await this.rendition?.prev() }

  async goTo(target) {
    // target may be a CFI, an href, or a toc item
    await this.rendition?.display(target)
  }

  getLocation() { return this._location }
  getProgress() { return this._progress }
  getToc() { return this._toc }
  getPageInfo() { return this._pageInfo || null }

  async search(query) {
    if (!query || !this.book) return []
    const results = []
    const spineItems = this.book.spine?.spineItems || []
    for (const item of spineItems) {
      try {
        await item.load(this.book.load.bind(this.book))
        const found = item.find(query) || []
        found.forEach((r) => results.push({ excerpt: r.excerpt, location: r.cfi }))
        item.unload()
      } catch { /* skip unreadable section */ }
      if (results.length > 200) break
    }
    return results
  }

  // ---- Highlights --------------------------------------------------------
  addHighlight(hl) {
    if (!this.rendition) return
    try {
      this.rendition.annotations.add(
        'highlight',
        hl.location,
        { id: hl.id },
        () => this.emit('highlight-click', hl),
        `hl-${hl.id}`,
        { fill: hl.color, 'fill-opacity': '0.35', 'mix-blend-mode': 'multiply' }
      )
      this._highlightHandlers.set(hl.id, hl.location)
    } catch (err) {
      console.warn('addHighlight failed', err)
    }
  }

  removeHighlight(hl) {
    const cfi = this._highlightHandlers.get(hl.id) || hl.location
    try { this.rendition?.annotations.remove(cfi, 'highlight') } catch { /* noop */ }
    this._highlightHandlers.delete(hl.id)
  }

  clearSelection() {
    this.rendition?.getContents?.().forEach((c) => c.window.getSelection()?.removeAllRanges())
  }

  destroy() {
    this._destroyed = true
    try { this.rendition?.destroy() } catch { /* noop */ }
    try { this.book?.destroy() } catch { /* noop */ }
  }

  // ---- helpers -----------------------------------------------------------
  _selectionRect(contents) {
    try {
      const range = contents.window.getSelection().getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const frame = contents.document.defaultView.frameElement?.getBoundingClientRect() || { left: 0, top: 0 }
      return {
        left: frame.left + rect.left,
        top: frame.top + rect.top,
        width: rect.width,
        height: rect.height,
        bottom: frame.top + rect.bottom
      }
    } catch {
      return null
    }
  }

  _flattenToc(items, depth = 0) {
    const out = []
    for (const it of items) {
      out.push({ label: it.label?.trim() || 'Untitled', href: it.href, depth })
      if (it.subitems?.length) out.push(...this._flattenToc(it.subitems, depth + 1))
    }
    return out
  }

  _friendlyError(err) {
    const msg = String(err?.message || err)
    if (/encrypt|drm|rights/i.test(msg)) {
      return { kind: 'drm', message: 'This EPUB appears to be DRM-protected and cannot be opened.' }
    }
    return { kind: 'parse', message: 'This EPUB could not be read — it may be corrupted.' }
  }
}

const THEME_COLORS = {
  light: { bg: '#faf9f7', text: '#1a1a1a', link: '#4361ee' },
  dark: { bg: '#15171c', text: '#d7d9de', link: '#6c8cff' },
  sepia: { bg: '#f4ecd8', text: '#4a3b2a', link: '#a8703a' },
  amoled: { bg: '#000000', text: '#c7c9ce', link: '#7e9bff' }
}
