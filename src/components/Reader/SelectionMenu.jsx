import { useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '../common/Icon.jsx'

// Floating menu shown on text selection: highlight colors, translate, copy.
export default function SelectionMenu({ selection, colors, onHighlight, onTranslate, onCopy, onDismiss }) {
  const ref = useRef(null)
  const [style, setStyle] = useState({ opacity: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = selection.rect
    const menuW = el.offsetWidth
    const menuH = el.offsetHeight
    const pad = 8
    let left = rect ? rect.left + rect.width / 2 - menuW / 2 : window.innerWidth / 2 - menuW / 2
    left = Math.max(pad, Math.min(left, window.innerWidth - menuW - pad))
    let top = rect ? rect.top - menuH - 10 : 80
    if (top < pad) top = (rect?.bottom ?? 80) + 10
    setStyle({ left, top, opacity: 1 })
  }, [selection])

  return (
    <>
      <div className="selection-scrim" onMouseDown={onDismiss} onTouchStart={onDismiss} />
      <div className="selection-menu" ref={ref} style={style} role="menu">
        <div className="selection-menu__colors">
          {colors.map((c) => (
            <button
              key={c} className="color-dot" style={{ background: c }}
              onClick={() => onHighlight(c)}
              aria-label={`Highlight ${c}`} title="Highlight"
            />
          ))}
        </div>
        <span className="selection-menu__sep" />
        <button className="selection-menu__action" onClick={onTranslate} title="Translate">
          <Icon.Translate width={17} height={17} /> Translate
        </button>
        <button className="selection-menu__action" onClick={onCopy} title="Copy">
          <Icon.Copy width={16} height={16} />
        </button>
      </div>
    </>
  )
}
