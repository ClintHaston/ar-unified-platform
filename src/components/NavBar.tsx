import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const TABS = [
  { key: 'evaluator', label: 'Evaluator', path: '/evaluator' },
  { key: 'deals', label: 'Deals', path: '/deals' },
  { key: 'leads', label: 'Lead Intelligence', path: '/leads' },
  { key: 'sales_command', label: 'Sales Command', path: '/sales-command' },
  { key: 'admin', label: 'Admin', path: '/admin', adminOnly: true },
]

export function NavBar() {
  const { user, permissions, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

  return (
    <nav className="nav">
      <span className="nav-brand bebas">ASSET <span className="nav-brand-accent">RE:SOURCE</span></span>

      <div className="nav-tabs">
        {TABS.map((tab) => {
          if (tab.adminOnly && !isAdmin) return null

          const hasAccess = tab.adminOnly ? isAdmin : (permissions[tab.key] ?? false)

          if (!hasAccess) {
            return (
              <span key={tab.key} className="nav-tab locked bebas" title="Access restricted">
                {tab.label}
              </span>
            )
          }

          return (
            <NavLink
              key={tab.key}
              to={tab.path}
              className={({ isActive }) => `nav-tab bebas${isActive ? ' active' : ''}`}
            >
              {tab.label}
            </NavLink>
          )
        })}
      </div>

      {user && (
        <div className="nav-user">
          <span className="nav-user-name">{user.name}</span>
          <button className="nav-logout bebas" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      )}
    </nav>
  )
}
