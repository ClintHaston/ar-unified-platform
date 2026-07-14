import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'

// Saved-dashboard switcher CHROME. Wired to accept saved dashboards later
// (Workstream 2c); until then it shows only the single default Dashboard —
// no fake data, and it says so plainly.

export function DashboardSwitcher() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div className="ws-menuwrap" ref={wrapRef}>
      <button className="ws-topbtn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="ws-ic"><Icon name="dashboard" size={16} /></span>
        <span>Default dashboard</span>
        <span className="ws-caret"><Icon name="chevron-down" size={12} /></span>
      </button>
      {open && (
        <div className="ws-menu" role="menu">
          <div className="ws-menuhead">Dashboards</div>
          <button className="ws-menuitem" role="menuitem" onClick={() => setOpen(false)}>
            <span className="ws-ic"><Icon name="dashboard" size={16} /></span>
            <span>Default dashboard</span>
          </button>
          <div className="ws-menudiv" />
          <div className="ws-menuhead" style={{ paddingBottom: 8 }}>
            Saved dashboards arrive in a later workstream. Nothing to show yet.
          </div>
        </div>
      )}
    </div>
  )
}
