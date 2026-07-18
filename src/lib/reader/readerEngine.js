// Common reader interface. epub.js (reflowable) and pdf.js (fixed-layout) have
// fundamentally different rendering models, so we do NOT force one internal
// renderer. Instead both engines implement this shape and the UI talks only to
// it. See epubEngine.js / pdfEngine.js.
//
// A "location" is an opaque, serializable pointer the engine understands:
//   - epub: a CFI string
//   - pdf:  { page, offset }
// The UI never inspects its internals — it just stores/restores it.
//
// Engine interface:
//   async init(container, { startLocation, settings })  -> void
//   destroy()                                            -> void
//   next() / prev()                                      -> Promise<void>
//   goTo(target)                                         -> Promise<void>  (location | href | page)
//   getLocation()                                        -> location
//   getProgress()                                        -> number (0..1)
//   getToc()                                             -> [{ label, href, subitems? }]
//   applySettings(settings)                              -> void
//   async search(query)                                  -> [{ excerpt, location }]
//   getSelection()                                       -> { text, cfiOrRect } | null
//   Events via on(event, cb): 'relocated', 'selected', 'loaded', 'error'
//
// Highlighting is engine-specific and exposed through addHighlight/removeHighlight.

import { EpubEngine } from './epubEngine.js'
import { PdfEngine } from './pdfEngine.js'

export { Emitter } from './emitter.js'

export function createEngine(format, source, opts = {}) {
  if (format === 'epub') return new EpubEngine(source, opts)
  if (format === 'pdf') return new PdfEngine(source, opts)
  throw new Error(`Unsupported format: ${format}`)
}
