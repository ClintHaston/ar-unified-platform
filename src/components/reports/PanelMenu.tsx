import { useEffect, useRef, useState } from 'react'
import { PANEL_SIZES, type PanelSize } from '../../lib/api'

// The per-panel kebab: resize, reorder, remove. Appears on hover, and on
// keyboard focus — a control that only exists under a mouse pointer does not
// exist for anyone navigating by keyboard.
//
// MOVE UP / MOVE DOWN ARE NOT REDUNDANT WITH DRAGGING. Drag-and-drop is the
// fast path; these two items are the accessible one. HTML5 DnD is mouse-only,
// so without them a keyboard user could add and size widgets but never arrange
// them, which is most of what composing a board is.

interface Props {
  size: PanelSize
  label: string           // what this panel is, for the menu's accessible name
  isFirst: boolean
  isLast: boolean
  onSize: (size: PanelSize) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}

export function PanelMenu({ size, label, isFirst, isLast, onSize, onMove, onRemove }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape. Focus stays inside the menu while it is
  // open, so an outside pointerdown is genuinely "I am done here".
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false) }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function act(fn: () => void) {
    fn()
    setOpen(false)
  }

  return (
    <div className="panel-menu" ref={wrap}>
      <button type="button" className="panel-kebab" aria-haspopup="menu"
              aria-expanded={open} aria-label={`Options for ${label}`}
              onClick={() => setOpen((v) => !v)}>
        ⋮
      </button>
      {open && (
        <div className="panel-menu-pop" role="menu" aria-label={`${label} options`}>
          <div className="pm-head">Width</div>
          <div className="roletoggle pm-sizes">
            {PANEL_SIZES.map((s) => (
              <button key={s.key} type="button" role="menuitemradio"
                      aria-checked={size === s.key}
                      className={size === s.key ? 'active' : ''}
                      onClick={() => act(() => onSize(s.key))}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="pm-sep" />
          <button type="button" role="menuitem" className="pm-item"
                  disabled={isFirst} onClick={() => act(() => onMove(-1))}>
            Move up
          </button>
          <button type="button" role="menuitem" className="pm-item"
                  disabled={isLast} onClick={() => act(() => onMove(1))}>
            Move down
          </button>
          <div className="pm-sep" />
          <button type="button" role="menuitem" className="pm-item danger"
                  onClick={() => act(onRemove)}>
            Remove from dashboard
          </button>
        </div>
      )}
    </div>
  )
}
