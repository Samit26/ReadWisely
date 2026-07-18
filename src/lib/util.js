// A few tiny helpers used across the app.

// crypto.randomUUID is available in all modern browsers over https/localhost.
export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

export function debounce(fn, ms) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

// Read a File/Blob into an ArrayBuffer.
export function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

export function detectFormat(file) {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.epub')) return 'epub'
  if (name.endsWith('.pdf')) return 'pdf'
  if (file.type === 'application/epub+zip') return 'epub'
  if (file.type === 'application/pdf') return 'pdf'
  return null
}
