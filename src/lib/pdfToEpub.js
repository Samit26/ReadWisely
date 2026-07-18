// Reflowable, text-first PDF to EPUB conversion. PDF.js provides the text and
// glyph geometry; the routines below rebuild lines, remove page furniture, and
// assemble paragraphs in reading order. This intentionally does not render
// source pages into images: the output remains searchable, resizable EPUB text.
import JSZip from 'jszip'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { uid } from './util.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const MAX_PAGES = 1000
const MIN_CHARS = 400
const HEADING = /^(chapter|part|book|prologue|epilogue|preface|foreword|introduction|appendix|afterword)\b/i

export async function convertPdfToEpub(arrayBuffer, meta = {}, onProgress) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise
  try {
    if (!pdf.numPages || pdf.numPages > MAX_PAGES) return null
    const pages = []
    let total = 0
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent({ normalizeWhitespace: true })
      const lines = textToLines(content.items, viewport)
      total += lines.reduce((sum, line) => sum + line.text.length, 0)
      pages.push({ index: index - 1, width: viewport.width, height: viewport.height, lines })
      page.cleanup()
    }
    if (total < MIN_CHARS) {
      const blocks = await ocrPdf(pdf, meta, onProgress)
      return blocks.length
        ? { epubBuffer: await makeEpub(makeChapters(blocks, [], meta.title || 'Untitled'), meta), strategy: 'ocr-reflowable-text' }
        : null
    }

    removeFurniture(pages)
    const metrics = documentMetrics(pages)
    const blocks = pages.flatMap((page) => pageToBlocks(page, metrics))
    if (blocks.reduce((sum, block) => sum + block.text.length, 0) < MIN_CHARS) return null

    const outline = await getOutline(pdf)
    const chapters = makeChapters(blocks, outline, meta.title || 'Untitled')
    return { epubBuffer: await makeEpub(chapters, meta), strategy: 'reflowable-text' }
  } finally {
    pdf.destroy()
  }
}

async function ocrPdf(pdf, meta, onProgress) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, { logger: (event) => onProgress?.({ stage: 'ocr', progress: event.progress || 0, status: event.status }) })
  const blocks = []
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number)
      const viewport = page.getViewport({ scale: 1.75 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d', { alpha: false })
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport, background: '#fff' }).promise
      const { data } = await worker.recognize(canvas)
      const pageBlocks = ocrTextToBlocks(data.text || '', number - 1)
      blocks.push(...pageBlocks)
      page.cleanup()
      onProgress?.({ stage: 'ocr', current: number, total: pdf.numPages, progress: number / pdf.numPages })
    }
  } finally {
    await worker.terminate()
  }
  return blocks
}

function ocrTextToBlocks(text, page) {
  const clean = text
    .replace(/^\s*(This Document has been modified with Flexcil.*|Flexcil - The Smart Study Toolkit.*)\s*$/gim, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  if (!clean) return []
  const groups = clean.split(/\n\s*\n+/).map((group) => group.replace(/\n+/g, ' ').replace(/([a-z])-\s+([a-z])/g, '$1$2').replace(/\s+/g, ' ').trim()).filter(Boolean)
  return groups.map((group) => ({
    type: /^(chapter\b|part\b|prologue\b|epilogue\b|\d{1,3})$/i.test(group) ? 'h2' : 'p',
    text: group,
    page
  }))
}
function textToLines(items, viewport) {
  const fragments = items
    .filter((item) => item.str?.trim())
    .map((item) => {
      const size = Math.hypot(item.transform?.[2] || 0, item.transform?.[3] || 0) || item.height || 10
      return { text: item.str, x: item.transform?.[4] || 0, y: item.transform?.[5] || 0, width: item.width || 0, size }
    })
    .sort((a, b) => (b.y - a.y) || (a.x - b.x))
  const raw = []
  for (const fragment of fragments) {
    const previous = raw[raw.length - 1]
    const tolerance = Math.max(2, fragment.size * 0.42)
    if (previous && Math.abs(previous.y - fragment.y) <= tolerance) {
      const gap = fragment.x - (previous.x + previous.width)
      const space = gap > Math.max(1.5, fragment.size * 0.13) && !previous.text.endsWith(' ') && !fragment.text.startsWith(' ')
      previous.text += (space ? ' ' : '') + fragment.text
      previous.width = Math.max(previous.width, fragment.x + fragment.width - previous.x)
      previous.size = Math.max(previous.size, fragment.size)
    } else raw.push({ ...fragment })
  }
  const cleaned = raw.map((line) => ({ ...line, text: line.text.replace(/\s+/g, ' ').trim() })).filter((line) => line.text)
  return orderColumns(cleaned, viewport.width)
}

function orderColumns(lines, pageWidth) {
  if (lines.length < 12) return lines
  const starts = lines.filter((line) => line.width < pageWidth * 0.75).map((line) => line.x).sort((a, b) => a - b)
  const left = starts[Math.floor(starts.length * 0.2)]
  const right = starts[Math.floor(starts.length * 0.8)]
  // Only treat a page as two columns when their start positions are clearly apart
  // and both sides have substantial text. This avoids splitting indented novels.
  if (right - left < pageWidth * 0.28) return lines
  const split = (left + right) / 2
  const a = lines.filter((line) => line.x < split)
  const b = lines.filter((line) => line.x >= split)
  if (a.length < 5 || b.length < 5) return lines
  return [...a.sort((x, y) => y.y - x.y), ...b.sort((x, y) => y.y - x.y)]
}

function removeFurniture(pages) {
  const counts = new Map()
  for (const page of pages) {
    const seen = new Set()
    for (const line of page.lines) {
      const key = normalize(line.text)
      if (key.length > 2 && !seen.has(key)) { counts.set(key, (counts.get(key) || 0) + 1); seen.add(key) }
    }
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.28))
  for (const page of pages) {
    page.lines = page.lines.filter((line) => {
      const edge = line.y < page.height * 0.1 || line.y > page.height * 0.9
      const repeated = (counts.get(normalize(line.text)) || 0) >= threshold && line.text.length < 110
      const number = /^(page\s+)?\d+(\s*\/\s*\d+)?$/i.test(line.text)
      return !(edge && (repeated || number))
    })
  }
}

function normalize(text) { return text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim() }

function documentMetrics(pages) {
  const sizes = new Map(); const margins = []
  for (const page of pages) for (const line of page.lines) {
    const size = Math.round(line.size)
    sizes.set(size, (sizes.get(size) || 0) + line.text.length)
    if (line.text.length > 25) margins.push(line.x)
  }
  const bodySize = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 11
  margins.sort((a, b) => a - b)
  return { bodySize, margin: margins[Math.floor(margins.length * 0.2)] || 0 }
}

function pageToBlocks(page, metrics) {
  const blocks = []; let paragraph = null; let previous = null
  const flush = () => { if (paragraph?.trim()) blocks.push({ type: 'p', text: paragraph.trim(), page: page.index }); paragraph = null }
  for (const line of page.lines) {
    const heading = isHeading(line, page, metrics)
    if (heading) { flush(); blocks.push({ type: 'h2', text: line.text, page: page.index }); previous = line; continue }
    const gap = previous ? previous.y - line.y : 0
    const indented = line.x > metrics.margin + metrics.bodySize * 1.1
    const separates = previous && (gap > Math.max(previous.size, line.size) * 1.75 || (indented && /[.!?…]$/.test(paragraph || '')))
    if (separates) flush()
    if (!paragraph) paragraph = line.text
    else if (/[a-z]-$/i.test(paragraph) && /^[a-z]/.test(line.text)) paragraph = paragraph.slice(0, -1) + line.text
    else paragraph += ' ' + line.text
    previous = line
  }
  flush()
  return blocks
}

function isHeading(line, page, metrics) {
  const short = line.text.length < 90
  const centered = Math.abs((line.x + line.width / 2) - page.width / 2) < page.width * 0.16
  return short && (HEADING.test(line.text) || (line.size >= metrics.bodySize * 1.25 && centered))
}

async function getOutline(pdf) {
  try {
    const outline = await pdf.getOutline(); if (!outline?.length) return []
    const result = []
    for (const item of outline.slice(0, 160)) {
      let dest = item.dest
      if (typeof dest === 'string') dest = await pdf.getDestination(dest)
      if (Array.isArray(dest) && dest[0]) result.push({ page: await pdf.getPageIndex(dest[0]), title: item.title?.trim() || 'Section' })
    }
    return result.sort((a, b) => a.page - b.page)
  } catch { return [] }
}

function makeChapters(blocks, outline, title) {
  const chapters = []; let current = { title, blocks: [] }; let outlineIndex = 0
  const push = () => { if (current.blocks.length) chapters.push(current) }
  for (const block of blocks) {
    while (outlineIndex < outline.length && block.page >= outline[outlineIndex].page) { push(); current = { title: outline[outlineIndex++].title, blocks: [] } }
    if (!outline.length && block.type === 'h2' && current.blocks.length) { push(); current = { title: block.text, blocks: [block] } }
    else current.blocks.push(block)
  }
  push()
  return chapters.length ? chapters : [{ title, blocks }]
}

function esc(value = '') { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function dataUrlToBytes(value) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(value || ''); if (!match) return null
  const binary = atob(match[2]); const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { mime: match[1], bytes }
}

async function makeEpub(chapters, meta) {
  const zip = new JSZip(); const cover = dataUrlToBytes(meta.cover)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
  zip.file('OEBPS/style.css', 'body{font-family:Georgia,serif;line-height:1.62;} h2{margin:2.8em 0 1.4em;text-align:center;font-size:1.45em;} p{margin:0;text-indent:1.4em;} h2+p,p:first-child{text-indent:0;}')
  if (cover) zip.file('OEBPS/cover.jpg', cover.bytes)
  const entries = chapters.map((chapter, index) => {
    const file = `chapter-${String(index + 1).padStart(3, '0')}.xhtml`
    const body = chapter.blocks.map((block) => `<${block.type}>${esc(block.text)}</${block.type}>`).join('\n')
    zip.file(`OEBPS/${file}`, `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(chapter.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`)
    return { file, id: `chapter-${index + 1}`, title: chapter.title }
  })
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${entries.map((entry) => `<li><a href="${entry.file}">${esc(entry.title)}</a></li>`).join('')}</ol></nav></body></html>`)
  const manifest = entries.map((entry) => `<item id="${entry.id}" href="${entry.file}" media-type="application/xhtml+xml"/>`).join('')
  const coverItem = cover ? `<item id="cover" href="cover.jpg" media-type="${cover.mime}" properties="cover-image"/>` : ''
  zip.file('OEBPS/content.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:${uid()}</dc:identifier><dc:title>${esc(meta.title || 'Untitled')}</dc:title>${meta.author ? `<dc:creator>${esc(meta.author)}</dc:creator>` : ''}<dc:language>und</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${coverItem}${manifest}</manifest><spine>${entries.map((entry) => `<itemref idref="${entry.id}"/>`).join('')}</spine></package>`)
  return zip.generateAsync({ type: 'arraybuffer', mimeType: 'application/epub+zip', compression: 'DEFLATE' })
}




