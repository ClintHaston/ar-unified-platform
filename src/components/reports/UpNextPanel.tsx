import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type UpNextResult, type UpNextTask } from '../../lib/api'
import { useQuickLog } from '../quicklog/QuickLogContext'
import { useToast } from '../shell/ToastContext'

// "Up next" — the tasks panel. Open tasks due today or already overdue, in the
// company timezone, soonest first.
//
// THE CHECKBOX IS THE POINT. A morning list you can only read is a list you
// stop opening; one you can clear in place is one you work. So completing is a
// single tap, optimistic (the row goes immediately — waiting on a round trip
// to cross something off feels broken), and undoable from the toast, because
// an optimistic one-tap action with no undo is just a fast mistake.
//
// `overdue` comes from the server, computed against the company timezone. The
// browser must not re-derive it: a rep working from a different timezone would
// otherwise see rows tinted differently from the "tasks due today" card
// counting the same rows.

function dueLabel(t: UpNextTask): string {
  if (!t.due_at) return ''
  const d = new Date(t.due_at)
  if (!t.overdue) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'overdue'
  return `${days}d late`
}

function taskLink(t: UpNextTask): string | null {
  if (t.deal_id) return `/deals/${t.deal_id}`
  if (t.contact_id) return `/contacts/${t.contact_id}`
  return null
}

export function UpNextPanel({ data }: { data: UpNextResult }) {
  const toast = useToast()
  const quickLog = useQuickLog()
  const [items, setItems] = useState<UpNextTask[]>(data.items)
  const [busy, setBusy] = useState<string | null>(null)

  // The panel's payload is refreshed by the dashboard run; adopt it whenever a
  // new one arrives so a reload does not fight the local optimistic state.
  useEffect(() => { setItems(data.items) }, [data.items])

  async function complete(t: UpNextTask) {
    if (busy) return
    setBusy(t.id)
    const before = items
    setItems((cur) => cur.filter((x) => x.id !== t.id))     // optimistic
    try {
      await api.completeTask(t.id)
      quickLog.bumpLogVersion()
      toast.info('Done', t.title, {
        label: 'Undo',
        run: async () => {
          try {
            await api.uncompleteTask(t.id)
            setItems(before)
            quickLog.bumpLogVersion()
          } catch (e) {
            toast.error('Could not reopen that task',
                        e instanceof Error ? e.message : 'Please try again.')
          }
        },
      })
    } catch (e) {
      setItems(before)                                       // rollback
      toast.error('Could not complete that task',
                  e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setBusy(null)
    }
  }

  if (!items.length) {
    return (
      <div className="upnext-empty">
        <div className="upnext-empty-t">Nothing due.</div>
        <button type="button" className="linklike"
                onClick={() => quickLog.openTask()}>
          Line up tomorrow → New task
        </button>
      </div>
    )
  }

  return (
    <ul className="upnext-list">
      {items.map((t, i) => {
        const to = taskLink(t)
        return (
          <li
            key={t.id}
            className={`upnext-row${t.overdue ? ' over' : ''}${busy === t.id ? ' ws-pending' : ''}`}
            style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
          >
            <button
              type="button"
              className="upnext-check"
              onClick={() => void complete(t)}
              disabled={busy === t.id}
              aria-label={`Complete: ${t.title}`}
              title="Mark done"
            />
            <span className="upnext-title">
              {to ? <Link to={to}>{t.title}</Link> : t.title}
            </span>
            <span className="upnext-due">{dueLabel(t)}</span>
          </li>
        )
      })}
    </ul>
  )
}
