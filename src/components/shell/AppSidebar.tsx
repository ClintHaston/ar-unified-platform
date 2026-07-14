import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { NAV, SECTION_LABEL, type NavItem } from './navConfig'
import { Icon } from './icons'

// Grouped sidebar. Items with a `flyout` reveal a CRM-style submenu on
// hover/focus (Contacts → Contacts/Companies/Deals/Offers; Reports; admin
// Settings). Collapsed mode (icons only) is driven by the parent
// .ws-nav-collapsed class. Admin items gated by role exactly as before.

function useIsActive() {
  const { pathname } = useLocation()
  return (path: string) => pathname === path || pathname.startsWith(path + '/')
}

export function AppSidebar() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const isActive = useIsActive()

  const visible = NAV.filter((n) => !n.adminOnly || isAdmin)
  const sections: NavItem['section'][] = ['primary', 'tools', 'admin']

  return (
    <nav className="ws-sidebar" aria-label="Primary">
      {sections.map((section) => {
        const items = visible.filter((n) => n.section === section)
        if (items.length === 0) return null
        return (
          <div key={section}>
            {SECTION_LABEL[section] && <div className="ws-navsect">{SECTION_LABEL[section]}</div>}
            {items.map((item) => {
              const active = isActive(item.path)
              const flyItems = (item.flyout?.items ?? []).filter((f) => !f.adminOnly || isAdmin)
              const hasFly = flyItems.length > 0
              const btn = (
                <button
                  className={`ws-navitem${active ? ' active' : ''}${item.buy ? ' buy' : ''}`}
                  onClick={() => navigate(item.path)}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="ws-ic"><Icon name={item.icon} size={18} /></span>
                  <span className="ws-label">{item.label}</span>
                  {hasFly && <span className="ws-caret"><Icon name="chevron-right" size={14} /></span>}
                </button>
              )
              if (!hasFly) return <div key={item.key}>{btn}</div>
              return (
                <div className="ws-flywrap" key={item.key}>
                  {btn}
                  <div className="ws-flyout" role="menu">
                    {item.flyout?.head && <div className="ws-flyhead">{item.flyout.head}</div>}
                    {flyItems.map((f) => (
                      <button
                        key={f.label + f.path}
                        className={`ws-flyitem${isActive(f.path) ? ' active' : ''}`}
                        role="menuitem"
                        onClick={() => navigate(f.path)}
                      >
                        <span className="ws-ic"><Icon name={f.icon} size={16} /></span>
                        <span style={{ flex: 1 }}>
                          {f.label}
                          {f.sublabel && <small style={{ display: 'block', color: 'var(--p-body)', fontSize: 11 }}>{f.sublabel}</small>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}
