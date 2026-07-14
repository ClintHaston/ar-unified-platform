import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './icons'

// Quick-add (+) menu. Every item LAUNCHES an existing, born-in-platform create
// flow — nothing new. Deal/contact/task/buy-opp open their page's existing form
// via ?new=1; intake is its own page; "Log note" opens the command palette so
// the rep picks the deal/contact/unit to log against (the note form lives on
// each detail page). All preview-safe.

interface QuickAddProps {
  onLogNote: () => void
}

interface AddAction {
  label: string
  sub: string
  icon: IconName
  buy?: boolean
  run: () => void
}

export function QuickAdd({ onLogNote }: QuickAddProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const go = (to: string) => { setOpen(false); navigate(to) }

  const actions: AddAction[] = [
    { label: 'New deal', sub: 'Sell-side pipeline', icon: 'deal', run: () => go('/pipelines?new=1') },
    { label: 'New contact', sub: 'Add to the CRM', icon: 'contacts', run: () => go('/contacts?new=1') },
    { label: 'New task', sub: 'Assign to any rep', icon: 'tasks', run: () => go('/tasks?new=1') },
    { label: 'Log note', sub: 'Pick a deal or contact', icon: 'note', run: () => { setOpen(false); onLogNote() } },
    { label: 'Intake unit', sub: 'Inventory wizard', icon: 'intake', run: () => go('/inventory/intake') },
    { label: 'New buy opp', sub: 'Buy-side interest', icon: 'buyops', buy: true, run: () => go('/buyer-opportunities?new=1') },
  ]

  return (
    <div className="ws-menuwrap" ref={wrapRef}>
      <button
        className="ws-topbtn ws-primary"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Quick add"
      >
        <span className="ws-ic"><Icon name="plus" size={16} /></span>
        <span>New</span>
      </button>
      {open && (
        <div className="ws-menu" role="menu">
          <div className="ws-menuhead">Create</div>
          {actions.map((a) => (
            <button key={a.label} className="ws-menuitem" role="menuitem" onClick={a.run}>
              <span className={`ws-ic${a.buy ? ' buy' : ''}`}><Icon name={a.icon} size={16} /></span>
              <span>
                {a.label}
                <small>{a.sub}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
