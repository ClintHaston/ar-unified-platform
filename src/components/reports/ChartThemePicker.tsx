import { useEffect, useRef, useState } from 'react'
import type { ChartThemeId } from '../../lib/api'
import { CHART_SCHEMES, schemeOf } from './charts/palette'

// The Edit-mode "Chart colors" control. Each scheme is a row of its own
// swatches beside its name, because a scheme's NAME tells you nothing about
// what it will do to your charts and the swatches tell you everything.
//
// Selection applies immediately (the board repaints under the open menu, which
// is the preview) and the caller persists it. Nothing here waits on the
// server: recolouring changes nothing the server computes, so re-running the
// whole board to watch a pie change colour would be a spinner in exchange for
// nothing — the same write-behind stance the layout edits take.

interface Props {
  value: ChartThemeId
  onChange: (id: ChartThemeId) => void
}

export function ChartThemePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)
  const active = schemeOf(value)

  // Close on an outside click or Escape. A colour menu left open over the
  // board hides the very charts it is recolouring.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="ctp-wrap" ref={wrap}>
      <button className="plat-btn ghost" onClick={() => setOpen((v) => !v)}
              aria-haspopup="listbox" aria-expanded={open}
              title="Choose the colour scheme for this dashboard's charts">
        <span className="ctp-dots" aria-hidden>
          {active.colors.slice(0, 4).map((c, i) => (
            <span key={i} className="ctp-dot" style={{ background: c }} />
          ))}
        </span>
        Chart colors
      </button>
      {open && (
        <div className="ctp-menu" role="listbox" aria-label="Chart colors">
          {CHART_SCHEMES.map((s) => (
            <button key={s.id} role="option" aria-selected={s.id === value}
                    className={`ctp-row${s.id === value ? ' active' : ''}`}
                    onClick={() => { onChange(s.id); setOpen(false) }}>
              <span className="ctp-swatches" aria-hidden>
                {s.colors.map((c, i) => (
                  <span key={i} className="ctp-sw" style={{ background: c }} />
                ))}
              </span>
              <span className="ctp-name">{s.name}</span>
              {s.id === value && <span className="ctp-check" aria-hidden>✓</span>}
            </button>
          ))}
          <div className="note ctp-note">
            Colours the charts on this dashboard. Funnels, gauges and your
            numbers keep their meaning colours.
          </div>
        </div>
      )}
    </div>
  )
}
