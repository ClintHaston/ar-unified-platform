import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './icons'
import { useAuth } from '../../contexts/AuthContext'
import { api, type DashboardListItem } from '../../lib/api'

// Saved-dashboard switcher (WS1 chrome, wired for real in WS2c). Lists the
// admin's dashboards with favorites surfaced first (server-ordered); selecting
// one loads it. "Default dashboard" is always the KPI home. Non-admins only
// ever see the default — dashboards are admin-only in v1.

export function DashboardSwitcher() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [open, setOpen] = useState(false)
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Refresh the list each time the menu opens so favorites/new dashboards show.
  useEffect(() => {
    if (!open || !isAdmin) return
    api.dashboards().then((r) => setDashboards(r.dashboards)).catch(() => setDashboards([]))
  }, [open, isAdmin])

  function go(path: string) {
    setOpen(false)
    navigate(path)
  }

  return (
    <div className="ws-menuwrap" ref={wrapRef}>
      <button className="ws-topbtn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="ws-ic"><Icon name="dashboard" size={16} /></span>
        <span>Dashboards</span>
        <span className="ws-caret"><Icon name="chevron-down" size={12} /></span>
      </button>
      {open && (
        <div className="ws-menu" role="menu">
          <div className="ws-menuhead">Dashboards</div>
          <button className="ws-menuitem" role="menuitem" onClick={() => go('/dashboard')}>
            <span className="ws-ic"><Icon name="dashboard" size={16} /></span>
            <span>Default dashboard</span>
          </button>

          {isAdmin && dashboards.length > 0 && (
            <>
              <div className="ws-menudiv" />
              {dashboards.map((d) => (
                <button key={d.id} className="ws-menuitem" role="menuitem" onClick={() => go(`/dashboards/${d.id}`)}>
                  <span className="ws-ic">
                    <Icon name={d.favorited ? 'star-filled' : 'dashboard'} size={16} />
                  </span>
                  <span>{d.name}</span>
                </button>
              ))}
            </>
          )}

          {isAdmin && (
            <>
              <div className="ws-menudiv" />
              <button className="ws-menuitem" role="menuitem" onClick={() => go('/reports')}>
                <span className="ws-ic"><Icon name="plus" size={16} /></span>
                <span>{dashboards.length === 0 ? 'Create a dashboard' : 'Manage dashboards'}</span>
              </button>
            </>
          )}

          {!isAdmin && (
            <div className="ws-menuhead" style={{ paddingBottom: 8 }}>
              Saved dashboards are admin-only.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
