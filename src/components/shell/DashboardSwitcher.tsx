import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './icons'
import { useAuth } from '../../contexts/AuthContext'
import { api, type DashboardListItem } from '../../lib/api'

// Saved-dashboard switcher (WS1 chrome, wired for real in WS2c). Lists the
// admin's dashboards with favorites surfaced first (server-ordered); selecting
// one loads it. Non-admins only ever see the main dashboard — dashboards are
// admin-only in v1.
//
// "Default" used to be a hardcoded label for the KPI home. It now means the
// user's ACTUAL choice: whichever dashboard they land on. When they have not
// chosen one, the KPI home IS the default, and the menu says so rather than
// implying a preference nobody set. The default is resolved server-side, so a
// default pointing at a deleted dashboard simply reads as "not set" here.

export function DashboardSwitcher() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [open, setOpen] = useState(false)
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([])
  const [defaultId, setDefaultId] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Refresh each time the menu opens so favorites/new dashboards and a changed
  // default all show without a reload.
  useEffect(() => {
    if (!open || !isAdmin) return
    api.dashboards().then((r) => setDashboards(r.dashboards)).catch(() => setDashboards([]))
    api.defaultDashboard()
      .then((r) => setDefaultId(r.default?.dashboard_id ?? null))
      .catch(() => setDefaultId(null))
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
          {/* The KPI home. It is only labelled "Default" when the user really
              has no default of their own, so the word always tells the truth. */}
          <button className="ws-menuitem" role="menuitem" onClick={() => go('/dashboard')}>
            <span className="ws-ic"><Icon name="dashboard" size={16} /></span>
            <span>Main dashboard</span>
            {isAdmin && defaultId === null && <span className="ws-menutag">Default</span>}
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
                  {d.id === defaultId && <span className="ws-menutag">Default</span>}
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
