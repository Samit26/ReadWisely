import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { uid } from '../lib/util.js'

const ToastContext = createContext(null)

// Small transient notifications. Errors are shown here so nothing fails silently.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
  }, [])

  const push = useCallback((type, message, ms = 4000) => {
    const id = uid()
    setToasts((prev) => [...prev, { id, type, message }])
    if (ms) timers.current.set(id, setTimeout(() => dismiss(id), ms))
    return id
  }, [dismiss])

  const api = {
    success: (m, ms) => push('success', m, ms),
    error: (m, ms) => push('error', m, ms ?? 6000),
    info: (m, ms) => push('info', m, ms),
    dismiss
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`} onClick={() => dismiss(t.id)}>
            <span className="toast__icon" aria-hidden>
              {t.type === 'success' ? '✓' : t.type === 'error' ? '!' : 'i'}
            </span>
            <span className="toast__msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
