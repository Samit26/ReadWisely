import JSZip from 'jszip'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Extract title/author + a small cover thumbnail (data URL) for the library card.
// Best-effort: never throws — falls back to the filename.

export async function extractMetadata(format, arrayBuffer, fallbackName) {
  const filenameMeta = nameMetadata(fallbackName)
  const base = { title: filenameMeta.title, author: filenameMeta.author, cover: null }
  try {
    const meta = format === 'epub' ? await epubMeta(arrayBuffer)
      : format === 'pdf' ? await pdfMeta(arrayBuffer)
      : {}
    // Online converters sometimes write a UUID into dc:title. Keep the useful
    // filename instead of showing that implementation detail in the library.
    for (const [key, value] of Object.entries(meta)) {
      if (value === undefined || value === null || value === '') continue
      if (key === 'title' && !isUsableTitle(value)) continue
      if (key === 'author' && isGeneratedValue(value)) continue
      base[key] = value
    }
  } catch (err) {
    console.warn('metadata extraction failed', err)
  }
  return base
}

function nameMetadata(name = 'Untitled') {
  const cleaned = name.replace(/\.(epub|pdf)$/i, '').replace(/[_]+/g, ' ').trim() || 'Untitled'
  const match = /^(.*?)\s*\(([^()]+)\)$/.exec(cleaned)
  return match ? { title: match[1].trim() || cleaned, author: match[2].trim() } : { title: cleaned, author: '' }
}

function isGeneratedValue(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value).trim())
}

function isUsableTitle(value) {
  const title = String(value).trim()
  return title.length > 1 && !isGeneratedValue(title) && !/^(untitled|unknown|book)$/i.test(title)
}

// An EPUB is a zip: read container.xml -> OPF -> dc:title/dc:creator/cover item.
// Parsing it directly (no epub.js) avoids spinning up the whole rendering
// machinery — and the teardown races that came with destroying it mid-flight.
async function epubMeta(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const parser = new DOMParser()

  const containerXml = await zip.file('META-INF/container.xml')?.async('string')
  if (!containerXml) return {}
  const container = parser.parseFromString(containerXml, 'application/xml')
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path')
  if (!opfPath) return {}

  const opfXml = await zip.file(opfPath)?.async('string')
  if (!opfXml) return {}
  const opf = parser.parseFromString(opfXml, 'application/xml')
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  const text = (sel) => opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', sel)[0]?.textContent?.trim()
  const title = text('title') || undefined
  const author = text('creator') || ''

  // Cover: EPUB3 `properties="cover-image"` item, else EPUB2 `<meta name="cover">`.
  let coverHref = null
  for (const item of opf.querySelectorAll('manifest > item')) {
    if ((item.getAttribute('properties') || '').includes('cover-image')) {
      coverHref = item.getAttribute('href')
      break
    }
  }
  if (!coverHref) {
    const coverId = [...opf.querySelectorAll('metadata > meta')]
      .find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content')
    if (coverId) {
      const item = [...opf.querySelectorAll('manifest > item')].find((i) => i.getAttribute('id') === coverId)
      coverHref = item?.getAttribute('href') || null
    }
  }

  let cover = null
  if (coverHref) {
    try {
      const coverPath = decodeURIComponent(opfDir + coverHref).replace(/\/{2,}/g, '/')
      const blob = await zip.file(coverPath)?.async('blob')
      if (blob) cover = await urlToDataUrl(URL.createObjectURL(blob), 240)
    } catch { /* no cover */ }
  }

  return { title, author, cover }
}

async function pdfMeta(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise
  let title, author
  try {
    const info = (await pdf.getMetadata())?.info || {}
    title = info.Title?.trim() || undefined
    author = info.Author?.trim() || ''
  } catch { /* ignore */ }
  let cover = null
  try {
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    const scale = 240 / viewport.width
    const scaled = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = scaled.width
    canvas.height = scaled.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise
    cover = canvas.toDataURL('image/jpeg', 0.8)
  } catch { /* ignore */ }
  pdf.destroy()
  return { title, author, cover, pageCount: pdf.numPages }
}

// Downscale an image URL to a JPEG data URL of a given width.
function urlToDataUrl(url, width) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const scale = width / img.width
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = img.height * scale
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      try { resolve(canvas.toDataURL('image/jpeg', 0.8)) } catch { resolve(null) }
      URL.revokeObjectURL(url)
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

