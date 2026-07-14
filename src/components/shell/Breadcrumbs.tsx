import { Link, useLocation } from 'react-router-dom'

// Route-derived breadcrumbs. Detail routes get a parent crumb that links back
// to the list; top-level routes render a single "here" crumb.

interface Crumb { label: string; to?: string }

const TOP: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/pipelines': 'Pipeline',
  '/buyer-opportunities': 'Buy opps',
  '/inventory': 'Inventory',
  '/inventory/intake': 'Intake unit',
  '/contacts': 'Contacts',
  '/tasks': 'Tasks',
  '/sales-sheet': 'Sales sheet',
  '/reports': 'Reports',
  '/commission': 'Commission report',
  '/evaluator': 'Evaluator',
  '/leads': 'Lead Intelligence',
  '/sales-command': 'Sales Command',
  '/deals-legacy': 'Deals (legacy)',
  '/admin': 'Team & settings',
  '/outbox': 'HubSpot outbox',
  '/lead-approvals': 'Lead approvals',
  '/spine': 'Spine',
  '/change-password': 'Change password',
}

// Detail routes → [parent crumb, leaf label]
const DETAIL: Array<{ prefix: string; parent: Crumb; leaf: string }> = [
  { prefix: '/deals/', parent: { label: 'Pipeline', to: '/pipelines' }, leaf: 'Deal detail' },
  { prefix: '/units/', parent: { label: 'Inventory', to: '/inventory' }, leaf: 'Unit detail' },
  { prefix: '/contacts/', parent: { label: 'Contacts', to: '/contacts' }, leaf: 'Contact detail' },
  { prefix: '/buyer-opportunities/', parent: { label: 'Buy opps', to: '/buyer-opportunities' }, leaf: 'Buy opp' },
]

function crumbsFor(pathname: string): Crumb[] {
  if (pathname === '/inventory/intake') {
    return [{ label: 'Inventory', to: '/inventory' }, { label: 'Intake unit' }]
  }
  const detail = DETAIL.find((d) => pathname.startsWith(d.prefix) && pathname.length > d.prefix.length)
  if (detail) return [detail.parent, { label: detail.leaf }]
  const top = TOP[pathname]
  return [{ label: top ?? 'Dashboard' }]
}

export function Breadcrumbs() {
  const { pathname } = useLocation()
  const crumbs = crumbsFor(pathname)
  return (
    <nav className="ws-crumbs" aria-label="Breadcrumb">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={i} style={{ display: 'contents' }}>
            {i > 0 && <span className="ws-sep" aria-hidden="true">/</span>}
            {c.to && !last
              ? <Link className="ws-crumb" to={c.to}>{c.label}</Link>
              : <span className={`ws-crumb${last ? ' here' : ''}`}>{c.label}</span>}
          </span>
        )
      })}
    </nav>
  )
}
