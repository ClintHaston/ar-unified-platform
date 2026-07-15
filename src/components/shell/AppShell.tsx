import { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../lib/api'
import { NotificationBell } from '../NotificationBell'
import { PersistentIframes } from '../PersistentIframes'
import { ToastProvider } from './ToastContext'
import { BreadcrumbTitleProvider } from './BreadcrumbTitle'
import { AppSidebar } from './AppSidebar'
import { Breadcrumbs } from './Breadcrumbs'
import { CommandPalette } from './CommandPalette'
import { QuickAdd } from './QuickAdd'
import { DashboardSwitcher } from './DashboardSwitcher'
import { ActivityRail } from './ActivityRail'
import { Icon } from './icons'

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

const LS_NAV = 'ws_nav_collapsed'
const LS_RAIL = 'ws_rail_collapsed'

// The application shell that wraps every authenticated route. Replaces the old
// PlatformShell chrome (preserving its grid areas, preview banner, auth, and
// PersistentIframes) with a grouped sidebar + flyouts, a Ctrl+K command bar,
// quick-add, breadcrumbs, a saved-dashboard switcher, and a collapsible
// activity rail. Frontend-only; no data is written by the shell itself.

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [preview, setPreview] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem(LS_NAV) === '1')
  const [railCollapsed, setRailCollapsed] = useState(() => localStorage.getItem(LS_RAIL) === '1')
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    api.meta().then((m) => setPreview(m.preview)).catch(() => setPreview(false))
  }, [])

  // Global command-bar shortcut: Ctrl+K (Windows primary) and ⌘K.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggleNav = useCallback(() => {
    setNavCollapsed((c) => { localStorage.setItem(LS_NAV, c ? '0' : '1'); return !c })
  }, [])
  const toggleRail = useCallback(() => {
    setRailCollapsed((c) => { localStorage.setItem(LS_RAIL, c ? '0' : '1'); return !c })
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const gridClass = `plat-grid${navCollapsed ? ' ws-nav-collapsed' : ''}${railCollapsed ? ' ws-rail-collapsed' : ''}`

  return (
    <ToastProvider>
      <BreadcrumbTitleProvider>
      <div className={gridClass}>
        {preview && (
          <div className="preview-banner">
            Preview: not yet live for reps. Deals still live in HubSpot until cutover.
          </div>
        )}
        {!preview && <div style={{ gridArea: 'banner' }} />}

        <div className="ws-brand">
          <span className="ws-brand-text">Asset <span className="ws-brand-mark">Resource</span></span>
          <button className="ws-collapse" onClick={toggleNav} title={navCollapsed ? 'Expand nav' : 'Collapse nav'} aria-label="Toggle navigation">
            <Icon name={navCollapsed ? 'chevron-right' : 'chevron-left'} size={16} />
          </button>
        </div>

        <div className="topbar">
          <Breadcrumbs />
          <div className="spacer" />
          {user && (
            <>
              <DashboardSwitcher />
              <button className="ws-topbtn ws-cmd" onClick={() => setPaletteOpen(true)} title="Search or run a command">
                <span className="ws-ic"><Icon name="search" size={16} /></span>
                <span>Search or jump to…</span>
                <span className="ws-cmd-hint">Ctrl K</span>
              </button>
              <QuickAdd onLogNote={() => setPaletteOpen(true)} />
              <button
                className={`ws-rail-toggle${!railCollapsed ? ' on' : ''}`}
                onClick={toggleRail}
                title={railCollapsed ? 'Show activity' : 'Hide activity'}
                aria-label="Toggle activity rail"
              >
                <Icon name="panel" size={16} />
              </button>
              <NotificationBell />
              <div className="who">Signed in as <b>{user.name} ({user.role})</b></div>
              <div className="avatar">{initials(user.name)}</div>
              <button className="signout" onClick={handleLogout}>Sign out</button>
            </>
          )}
        </div>

        <AppSidebar />

        <main className="plat-main">
          <PersistentIframes />
          <Outlet />
        </main>

        {user && !railCollapsed && <ActivityRail />}
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </BreadcrumbTitleProvider>
    </ToastProvider>
  )
}
