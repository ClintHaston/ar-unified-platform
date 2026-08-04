import { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useIsMobile } from '../../hooks/useIsMobile'
import { api } from '../../lib/api'
import { notifyLogout } from '../../lib/registerSW'
import { NotificationBell } from '../NotificationBell'
import { PersistentIframes } from '../PersistentIframes'
import { ToastProvider } from './ToastContext'
import { QuickLogProvider } from '../quicklog/QuickLogContext'
import { BreadcrumbTitleProvider } from './BreadcrumbTitle'
import { AppSidebar } from './AppSidebar'
import { Breadcrumbs } from './Breadcrumbs'
import { CommandPalette } from './CommandPalette'
import { QuickAdd } from './QuickAdd'
import { DashboardSwitcher } from './DashboardSwitcher'
import { ActivityRail } from './ActivityRail'
import { MobileTabBar } from './MobileTabBar'
import { InstallCoach } from './InstallCoach'
import { MobileAccountMenu } from './MobileAccountMenu'
import { ShellEffects } from './ShellEffects'
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
//
// PWA build (2026-08-03) — THE PHONE GETS DIFFERENT CHROME, NOT SMALLER CHROME.
// Under 768px the sidebar's fifteen destinations become a four-tab bar at the
// bottom (thumb reach, not eye level) and the topbar drops to brand + search.
// Both are branches here rather than `display: none` in CSS, because the
// desktop chrome is not free: the activity rail polls, the dashboard switcher
// fetches a list, and the notification bell polls a count. On a phone on cell
// data those are three requests for three things the rep cannot see.
//
// The desktop tree is byte-for-byte what it was; every mobile addition is
// inside an `isMobile` branch.

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
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
    // Tell the service worker first: it holds this session's API responses,
    // and dropping them before the redirect means the next sign-in cannot be
    // handed the last one's data during a dropout.
    notifyLogout()
    await logout()
    navigate('/login')
  }

  const gridClass = `plat-grid${navCollapsed ? ' ws-nav-collapsed' : ''}`
    + `${railCollapsed ? ' ws-rail-collapsed' : ''}${isMobile ? ' ws-mobile' : ''}`

  return (
    // QuickLogProvider sits INSIDE ToastProvider: logging confirms itself with
    // a toast, and the "log it?" offer after a tel: tap is a toast with a
    // button, so the log layer depends on the toast layer and not the reverse.
    <ToastProvider>
      <QuickLogProvider>
      <BreadcrumbTitleProvider>
      <ShellEffects />
      <div className={gridClass}>
        {preview && (
          <div className="preview-banner">
            Preview: not yet live for reps. Deals still live in HubSpot until cutover.
          </div>
        )}
        {!preview && <div style={{ gridArea: 'banner' }} />}

        {!isMobile && (
          <div className="ws-brand">
            <span className="ws-brand-text">Asset <span className="ws-brand-mark">Resource</span></span>
            <button className="ws-collapse" onClick={toggleNav} title={navCollapsed ? 'Expand nav' : 'Collapse nav'} aria-label="Toggle navigation">
              <Icon name={navCollapsed ? 'chevron-right' : 'chevron-left'} size={16} />
            </button>
          </div>
        )}

        <div className="topbar">
          {isMobile ? (
            <>
              {/* Brand + search, per spec. The account button is the one
                  addition — see MobileAccountMenu for why. */}
              <span className="ws-mbrand">Asset <span className="ws-brand-mark">Resource</span></span>
              <div className="spacer" />
              {user && (
                <>
                  <button className="ws-miconbtn" onClick={() => setPaletteOpen(true)}
                          aria-label="Search or jump to">
                    <Icon name="search" size={20} />
                  </button>
                  <MobileAccountMenu
                    name={user.name}
                    role={user.role}
                    initials={initials(user.name)}
                    onSignOut={handleLogout}
                  />
                </>
              )}
            </>
          ) : (
            <>
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
                  <QuickAdd />
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
            </>
          )}
        </div>

        {!isMobile && <AppSidebar />}

        <main className="plat-main">
          <PersistentIframes />
          <Outlet />
        </main>

        {!isMobile && user && !railCollapsed && <ActivityRail />}
        {isMobile && user && <MobileTabBar />}
      {isMobile && user && <InstallCoach />}
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </BreadcrumbTitleProvider>
      </QuickLogProvider>
    </ToastProvider>
  )
}
