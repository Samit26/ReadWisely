import { Emitter } from './emitter.js'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// PDF engine — fixed-layout via pdf.js, continuous scroll. Pages are rendered
// lazily (IntersectionObserver) so large PDFs stay responsive: only pages near
// the viewport get a canvas + text layer; others keep a correctly-sized spacer.
export class PdfEngine extends Emitter {
  constructor(source, opts = {}) {
    super()
    this.format = 'pdf'
    this.source = source
    this.pdf = null
    this.container = null
    this.scroller = null
    this._pages = [] // { num, el, canvas, textLayerEl, viewport, rendered, rendering }
    this._toc = []
    this._numPages = 0
    this._current = 1
    this._progress = 0
    this._scale = 1.2
    this._destroyed = false
    this._observer = null
  }

  async init(container, { startLocation, settings } = {}) {
    this.container = container
    this._settings = settings

    const scroller = document.createElement('div')
    scroller.className = 'pdf-scroller'
    container.appendChild(scroller)
    this.scroller = scroller

    try {
      const loadingTask = pdfjsLib.getDocument({ data: this.source })
      this.pdf = await loadingTask.promise
    } catch (err) {
      this.emit('error', this._friendlyError(err))
      throw err
    }

    this._numPages = this.pdf.numPages
    await this._buildToc()
    await this._layoutPages()

    // Lazily render pages as they scroll into view.
    this._observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const page = this._pages[Number(e.target.dataset.page) - 1]
          if (!page) continue
          if (e.isIntersecting) this._renderPage(page)
        }
      },
      { root: scroller, rootMargin: '800px 0px' }
    )
    this._pages.forEach((p) => this._observer.observe(p.el))

    // Track which page is centered for location + progress.
    this._onScroll = () => {
      this._updateCurrentPage()
      this.emit('scroll', { top: scroller.scrollTop })
    }
    scroller.addEventListener('scroll', this._onScroll, { passive: true })

    // Keep text-layer scale in sync when the page boxes change size
    // (window resize, margin slider, zoom width transition).
    this._resizeObserver = new ResizeObserver(() => {
      for (const p of this._pages) if (p.rendered) this._syncTextLayerScale(p)
    })
    this._resizeObserver.observe(scroller)

    // Selection -> translate/highlight.
    this._onMouseUp = () => this._emitSelection()
    scroller.addEventListener('mouseup', this._onMouseUp)
    scroller.addEventListener('touchend', this._onMouseUp)

    this.applySettings(settings)

    if (startLocation?.page) {
      this.goTo(startLocation.page)
      if (startLocation.scrollRatio) {
        requestAnimationFrame(() => {
          scroller.scrollTop += (startLocation.scrollRatio || 0) * (this._pages[startLocation.page - 1]?.el.offsetHeight || 0)
        })
      }
    }
    this._updateCurrentPage()
    this.emit('loaded', { toc: this._toc })
  }

  async _layoutPages() {
    // Create spacer containers with the right height for each page up front.
    const page1 = await this.pdf.getPage(1)
    const baseViewport = page1.getViewport({ scale: this._scale })
    this._baseRatio = baseViewport.height / baseViewport.width

    for (let n = 1; n <= this._numPages; n++) {
      const el = document.createElement('div')
      el.className = 'pdf-page'
      el.dataset.page = String(n)
      // Provisional height; refined once the page's real viewport is known.
      el.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`
      this.scroller.appendChild(el)
      this._pages.push({ num: n, el, rendered: false, rendering: false })
    }
  }

  // The text layer is laid out at raster-viewport pixel size; scale it to the
  // page box's displayed width so selection lines up at any zoom/window size.
  _syncTextLayerScale(page) {
    if (!page.textLayerEl || !page.viewport) return
    const displayed = page.el.clientWidth || page.viewport.width
    const factor = displayed / page.viewport.width
    page.textLayerEl.style.transformOrigin = '0 0'
    page.textLayerEl.style.transform = `scale(${factor})`
  }

  async _renderPage(page) {
    if (page.rendered || page.rendering || this._destroyed) return
    page.rendering = true
    try {
      const pdfPage = await this.pdf.getPage(page.num)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = pdfPage.getViewport({ scale: this._scale })
      page.viewport = viewport
      page.el.style.aspectRatio = `${viewport.width} / ${viewport.height}`

      const canvas = document.createElement('canvas')
      canvas.className = 'pdf-canvas'
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      page.canvas = canvas

      await pdfPage.render({ canvasContext: ctx, viewport }).promise
      page.el.appendChild(canvas)

      // Text layer for selection + search highlights. Its spans are positioned
      // in viewport-pixel coordinates, so it gets explicit px dimensions and is
      // CSS-scaled to whatever width the page box actually displays at.
      const textLayerEl = document.createElement('div')
      textLayerEl.className = 'pdf-text-layer'
      textLayerEl.style.width = `${viewport.width}px`
      textLayerEl.style.height = `${viewport.height}px`
      textLayerEl.style.setProperty('--scale-factor', String(viewport.scale))
      page.el.appendChild(textLayerEl)
      page.textLayerEl = textLayerEl
      this._syncTextLayerScale(page)
      try {
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: pdfPage.streamTextContent(),
          container: textLayerEl,
          viewport
        })
        await textLayer.render()
      } catch { /* text layer optional (scanned PDFs may lack text) */ }

      // Highlight overlay for this page.
      const overlay = document.createElement('div')
      overlay.className = 'pdf-hl-layer'
      page.el.appendChild(overlay)
      page.overlayEl = overlay
      this._renderPageHighlights(page)

      page.rendered = true
    } catch (err) {
      console.warn(`page ${page.num} render failed`, err)
    } finally {
      page.rendering = false
    }
  }

  async _buildToc() {
    try {
      const outline = await this.pdf.getOutline()
      if (!outline?.length) { this._toc = []; return }
      const flat = []
      const walk = async (items, depth) => {
        for (const it of items) {
          let page = null
          try {
            const dest = typeof it.dest === 'string' ? await this.pdf.getDestination(it.dest) : it.dest
            if (dest) {
              const ref = dest[0]
              page = (await this.pdf.getPageIndex(ref)) + 1
            }
          } catch { /* dest may be unresolvable */ }
          flat.push({ label: it.title?.trim() || 'Untitled', href: page, depth })
          if (it.items?.length) await walk(it.items, depth + 1)
        }
      }
      await walk(outline, 0)
      this._toc = flat
    } catch {
      this._toc = []
    }
  }

  _updateCurrentPage() {
    if (!this.scroller) return
    const mid = this.scroller.scrollTop + this.scroller.clientHeight / 2
    let acc = 0
    let current = 1
    for (const p of this._pages) {
      const h = p.el.offsetHeight
      if (mid >= acc && mid < acc + h) { current = p.num; break }
      acc += h
      current = p.num
    }
    const total = this.scroller.scrollHeight - this.scroller.clientHeight
    this._progress = total > 0 ? this.scroller.scrollTop / total : 0
    this._pageInfo = { current, total: this._numPages, kind: 'page' }
    if (current !== this._current || true) {
      this._current = current
      const pageEl = this._pages[current - 1]?.el
      const ratio = pageEl ? (this.scroller.scrollTop - pageEl.offsetTop) / (pageEl.offsetHeight || 1) : 0
      this._location = { page: current, scrollRatio: Math.max(0, Math.min(1, ratio)) }
      this.emit('relocated', { location: this._location, progress: this._progress, pageInfo: this._pageInfo })
    }
  }

  async next() { this.goTo(Math.min(this._numPages, this._current + 1)) }
  async prev() { this.goTo(Math.max(1, this._current - 1)) }

  async goTo(target) {
    const page = typeof target === 'object' ? target.page : Number(target)
    const el = this._pages[page - 1]?.el
    if (el) el.scrollIntoView({ block: 'start', behavior: 'auto' })
  }

  getLocation() { return this._location }
  getProgress() { return this._progress }
  getToc() { return this._toc }
  getPageInfo() { return this._pageInfo || { current: this._current, total: this._numPages, kind: 'page' } }

  // Text from the pages up to the current page, tail-trimmed to ~maxChars.
  // The backward walk naturally covers scope='recent' (small cap) and scope='all'
  // (large cap → walks to page 1). Used for the AI recap.
  async getReadText({ maxChars = 15000 } = {}) {
    if (!this.pdf) return ''
    const current = this._current || 1
    const parts = []
    // Walk backwards from the current page, collecting text until we have enough.
    for (let n = current; n >= 1 && parts.join(' ').length < maxChars; n--) {
      try {
        const page = await this.pdf.getPage(n)
        const content = await page.getTextContent()
        const text = content.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim()
        if (text) parts.unshift(text)
      } catch { /* skip unreadable page */ }
    }
    const joined = parts.join('\n\n')
    return joined.length > maxChars ? joined.slice(-maxChars) : joined
  }

  async search(query) {
    if (!query || !this.pdf) return []
    const results = []
    const q = query.toLowerCase()
    for (let n = 1; n <= this._numPages; n++) {
      try {
        const page = await this.pdf.getPage(n)
        const content = await page.getTextContent()
        const text = content.items.map((i) => i.str).join(' ')
        const lower = text.toLowerCase()
        let idx = lower.indexOf(q)
        while (idx !== -1 && results.length < 300) {
          const start = Math.max(0, idx - 40)
          results.push({
            excerpt: (start > 0 ? '…' : '') + text.slice(start, idx + query.length + 40).trim() + '…',
            location: { page: n },
            page: n
          })
          idx = lower.indexOf(q, idx + q.length)
        }
      } catch { /* skip */ }
      if (results.length >= 300) break
    }
    return results
  }

  applySettings(settings) {
    if (!settings) return
    const prevZoom = this._settings?.pdfZoom || 100
    this._settings = settings
    // PDF is fixed-layout: font/spacing/align don't reflow content. What DOES
    // apply: theme tint (CSS filter), and zoom — which scales page width and
    // re-renders canvases at the new scale so text stays crisp.
    this.container?.setAttribute('data-pdf-theme', settings.theme)
    const zoom = settings.pdfZoom || 100
    this.scroller?.style.setProperty('--pdf-zoom', String(zoom / 100))
    if (zoom !== prevZoom && this.pdf) {
      // Debounce: the zoom stepper can fire rapidly.
      clearTimeout(this._zoomTimer)
      this._zoomTimer = setTimeout(() => this._rerenderForZoom(zoom), 250)
    }
  }

  _rerenderForZoom(zoom) {
    if (this._destroyed) return
    // Bump the raster scale to match the display size, then re-render lazily.
    this._scale = 1.2 * Math.max(1, zoom / 100)
    for (const p of this._pages) {
      if (!p.rendered && !p.rendering) continue
      p.el.innerHTML = ''
      p.rendered = false
      p.canvas = null
      p.textLayerEl = null
      p.overlayEl = null
    }
    // Re-observing re-fires the callback with current intersection state, so
    // visible pages re-render immediately and the rest stay lazy.
    this._pages.forEach((p) => {
      this._observer?.unobserve(p.el)
      this._observer?.observe(p.el)
    })
  }

  // ---- Highlights (page + normalized rects) ------------------------------
  addHighlight(hl) {
    this._pageHighlights ||= new Map()
    const list = this._pageHighlights.get(hl.location.page) || []
    list.push(hl)
    this._pageHighlights.set(hl.location.page, list)
    const page = this._pages[hl.location.page - 1]
    if (page?.overlayEl) this._renderPageHighlights(page)
  }

  removeHighlight(hl) {
    const list = this._pageHighlights?.get(hl.location.page) || []
    this._pageHighlights?.set(hl.location.page, list.filter((h) => h.id !== hl.id))
    const page = this._pages[hl.location.page - 1]
    if (page?.overlayEl) this._renderPageHighlights(page)
  }

  _renderPageHighlights(page) {
    if (!page.overlayEl) return
    page.overlayEl.innerHTML = ''
    const list = this._pageHighlights?.get(page.num) || []
    for (const hl of list) {
      for (const r of hl.location.rects || []) {
        const div = document.createElement('div')
        div.className = 'pdf-hl'
        div.style.left = `${r.x * 100}%`
        div.style.top = `${r.y * 100}%`
        div.style.width = `${r.w * 100}%`
        div.style.height = `${r.h * 100}%`
        div.style.background = hl.color
        div.title = hl.note || ''
        div.addEventListener('click', () => this.emit('highlight-click', hl))
        page.overlayEl.appendChild(div)
      }
    }
  }

  // Build a highlight descriptor from the current selection (normalized rects).
  getSelectionHighlight() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null
    const range = sel.getRangeAt(0)
    // Find which page the selection is in.
    let pageEl = range.startContainer
    while (pageEl && !(pageEl.classList && pageEl.classList.contains('pdf-page'))) pageEl = pageEl.parentElement
    if (!pageEl) return null
    const pageNum = Number(pageEl.dataset.page)
    const pageRect = pageEl.getBoundingClientRect()
    const rects = Array.from(range.getClientRects()).map((r) => ({
      x: (r.left - pageRect.left) / pageRect.width,
      y: (r.top - pageRect.top) / pageRect.height,
      w: r.width / pageRect.width,
      h: r.height / pageRect.height
    }))
    return { page: pageNum, rects, text: sel.toString() }
  }

  clearSelection() {
    window.getSelection()?.removeAllRanges()
  }

  _emitSelection() {
    const sel = window.getSelection()
    const text = sel?.toString() || ''
    if (!text.trim() || !sel.rangeCount) return
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    const hl = this.getSelectionHighlight()
    this.emit('selected', {
      text,
      location: hl ? { page: hl.page, rects: hl.rects } : null,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, bottom: rect.bottom }
    })
  }

  destroy() {
    this._destroyed = true
    clearTimeout(this._zoomTimer)
    this._observer?.disconnect()
    this._resizeObserver?.disconnect()
    this.scroller?.removeEventListener('scroll', this._onScroll)
    this.scroller?.removeEventListener('mouseup', this._onMouseUp)
    this.scroller?.removeEventListener('touchend', this._onMouseUp)
    try { this.pdf?.destroy() } catch { /* noop */ }
    if (this.container) this.container.innerHTML = ''
  }

  _friendlyError(err) {
    const msg = String(err?.message || err)
    if (err?.name === 'PasswordException' || /password/i.test(msg)) {
      return { kind: 'drm', message: 'This PDF is password-protected and cannot be opened.' }
    }
    return { kind: 'parse', message: 'This PDF could not be read — it may be corrupted.' }
  }
}
