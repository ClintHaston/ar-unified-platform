import { useLocation, useNavigate } from 'react-router-dom'
import { useQuickLog } from '../quicklog/QuickLogContext'
import { Icon, type IconName } from './icons'

// The phone's whole navigation: four tabs, thumb-height, pinned to the bottom.
//
// FOUR, NOT FOURTEEN. The sidebar carries fifteen destinations because a desk
// has room for fifteen. A rep standing at a machine has room for the four
// things they do between calls, and every extra tab makes the four they
// actually need smaller. Everything else on the phone is still reachable —
// through search, or by following a link — it just is not competing for the
// bottom of the screen.
//
// "Log" IS NOT A ROUTE. It opens the quick-log modal directly, on `call`,
// because the fastest path from a truck is tap tab -> tap outcome -> done. A
// /log route would add a page load and a back-button trap in the middle of
// that. It is the only tab that is a button rather than a destination, which
// is also why it never renders as "current".

type Tab =
  | { key: string; label: string; icon: IconName; to: string; match: (p: string) => boolean }
  | { key: string; label: string; icon: IconName; action: 'log' }

// My Day matches "/" (the landing that resolves a rep's default dashboard) and
// every dashboard route it can land on, so the tab stays lit wherever that
// resolution ends up.
const TABS: Tab[] = [
  {
    key: 'myday', label: 'My Day', icon: 'dashboard', to: '/',
    match: (p) => p === '/' || p === '/dashboard' || p.startsWith('/dashboards'),
  },
  {
    key: 'contacts', label: 'Contacts', icon: 'contacts', to: '/contacts',
    match: (p) => p.startsWith('/contacts') || p.startsWith('/companies'),
  },
  { key: 'log', label: 'Log', icon: 'phone', action: 'log' },
  {
    key: 'tasks', label: 'Tasks', icon: 'tasks', to: '/tasks',
    match: (p) => p.startsWith('/tasks'),
  },
]

export function MobileTabBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const quickLog = useQuickLog()

  return (
    <nav className="ws-tabbar" aria-label="Primary">
      {TABS.map((t) => {
        const isLog = 'action' in t
        const active = !isLog && t.match(pathname)
        return (
          <button
            key={t.key}
            type="button"
            className={`ws-tab${active ? ' active' : ''}${isLog ? ' ws-tab-log' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => (isLog ? quickLog.openCall() : navigate(t.to))}
          >
            <span className="ws-tab-ic"><Icon name={t.icon} size={22} /></span>
            <span className="ws-tab-label">{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
