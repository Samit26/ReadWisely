import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon.jsx'

export default function Modal({ title, onClose, children, footer, wide, className = '' }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  return createPortal(
    <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} style={wide ? { maxWidth: 640 } : undefined}>
        <div className="modal__head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.Close /></button></div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
