import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import { GlobalSearch } from './GlobalSearch'
import { NotificationBell } from './NotificationBell'
import { PersistentIframes } from './PersistentIframes'

// App shell per the signed-off ar-unified-platform-prototype_4.html:
// brand cell + topbar + sidebar nav, navy/gold light theme. The preview
// banner (Amendment 14) renders whenever the settings-driven flag is on —
// flipping settings.preview_mode hides it without a redeploy.

const NATIVE_ITEMS = [
  { path: '/dashboard', ic: '#', label: 'Dashboard' },
  { path: '/pipelines', ic: '|', label: 'Pipelines' },
  { path: '/inventory', ic: '=', label: 'Inventory' },
  { path: '/contacts', ic: 'o', label: 'Contacts' },
]

const TOOL_ITEMS = [
  { path: '/evaluator', ic: '$', label: 'Evaluator' },
  { path: '/deals-legacy', ic: '=', label: 'Deals (legacy)' },
  { path: '/leads', ic: '>', label: 'Lead Intelligence' },
  { path: '/sales-command', ic: '-', label: 'Sales Command' },
]

const ADMIN_ITEMS = [
  { path: '/admin', ic: '@', label: 'Team & settings' },
  { path: '/spine', ic: '+', label: 'Spine' },
]

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/pipelines': 'Pipelines',
  '/inventory': 'Inventory',
  '/contacts': 'Contacts',
  '/evaluator': 'Evaluator',
  '/deals-legacy': 'Deals (legacy)',
  '/leads': 'Lead Intelligence',
  '/sales-command': 'Sales Command',
  '/admin': 'Team & settings',
  '/spine': 'Spine',
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

export function PlatformShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    api.meta().then((m) => setPreview(m.preview)).catch(() => setPreview(false))
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const isAdmin = user?.role === 'admin'
  const title = pathname.startsWith('/deals/') ? 'Deal detail'
    : pathname.startsWith('/units/') ? 'Unit detail'
    : pathname.startsWith('/contacts/') ? 'Contact detail'
    : (TITLES[pathname] ?? 'Dashboard')

  return (
    <div className="plat-grid">
      {preview && (
        <div className="preview-banner">
          Preview — not yet live for reps. Deals still live in HubSpot until cutover.
        </div>
      )}
      {!preview && <div style={{ gridArea: 'banner' }} />}

      <div className="brand-cell">Asset <span>Resource</span></div>

      <div className="topbar">
        <div className="page-title">{title}</div>
        <div className="spacer" />
        {user && <GlobalSearch />}
        {user && <NotificationBell />}
        {user && (
          <>
            <div className="who">Signed in as <b>{user.name} ({user.role})</b></div>
            <div className="avatar">{initials(user.name)}</div>
            <button className="signout" onClick={handleLogout}>Sign out</button>
          </>
        )}
      </div>

      <nav className="side-nav">
        {NATIVE_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `navitem${isActive ? ' active' : ''}`}
          >
            <span className="ic">{item.ic}</span> {item.label}
          </NavLink>
        ))}
        <div className="sect">Tools</div>
        {TOOL_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `navitem${isActive ? ' active' : ''}`}
          >
            <span className="ic">{item.ic}</span> {item.label}
          </NavLink>
        ))}
        {isAdmin && (
          <>
            <div className="sect">Platform (admin only)</div>
            {ADMIN_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `navitem${isActive ? ' active' : ''}`}
              >
                <span className="ic">{item.ic}</span> {item.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <main className="plat-main">
        <PersistentIframes />
        <Outlet />
      </main>
    </div>
  )
}
