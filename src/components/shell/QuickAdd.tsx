import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './icons'
import { useQuickLog } from '../quicklog/QuickLogContext'

// Quick-add (+) menu.
//
// It used to be a launcher only: every item navigated to a page whose form did
// the actual work, and "Log note" could only open the command palette so the
// rep could go find a detail page to log on. That is the navigation tax this
// build exists to remove — logging a call was three screens away from
// wherever a rep actually was.
//
// The three LOG entries now open the quick-log modal in place. The CREATE
// entries still launch their pages' existing flows, because a deal, a contact
// and an intake genuinely need a full form; a call does not.

export function QuickAdd() {
  const navigate = useNavigate()
  const quickLog = useQuickLog()
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
  const log = (run: () => void) => { setOpen(false); run() }

  interface AddAction {
    label: string
    sub: string
    icon: IconName
    buy?: boolean
    group: 'Log' | 'Create'
    run: () => void
  }

  const actions: AddAction[] = [
    // Logging first: it is the thing a rep does ten times a day.
    { label: 'Log call', sub: 'One tap, any record', icon: 'note', group: 'Log',
      run: () => log(() => quickLog.openCall()) },
    { label: 'Log note', sub: 'Deal, contact or unit', icon: 'note', group: 'Log',
      run: () => log(() => quickLog.openNote()) },
    { label: 'New task', sub: 'Due today, tomorrow, next week', icon: 'tasks', group: 'Log',
      run: () => log(() => quickLog.openTask()) },
    { label: 'New deal', sub: 'Sell-side pipeline', icon: 'deal', group: 'Create',
      run: () => go('/pipelines?new=1') },
    { label: 'New contact', sub: 'Add to the CRM', icon: 'contacts', group: 'Create',
      run: () => go('/contacts?new=1') },
    { label: 'Intake unit', sub: 'Inventory wizard', icon: 'intake', group: 'Create',
      run: () => go('/inventory/intake') },
    { label: 'New buy opp', sub: 'Buy-side interest', icon: 'buyops', buy: true, group: 'Create',
      run: () => go('/buyer-opportunities?new=1') },
  ]

  let lastGroup = ''

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
          {actions.map((a) => {
            const head = a.group !== lastGroup ? a.group : null
            lastGroup = a.group
            return (
              <div key={a.label}>
                {head && <div className="ws-menuhead">{head}</div>}
                <button className="ws-menuitem" role="menuitem" onClick={a.run}>
                  <span className={`ws-ic${a.buy ? ' buy' : ''}`}><Icon name={a.icon} size={16} /></span>
                  <span>
                    {a.label}
                    <small>{a.sub}</small>
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
