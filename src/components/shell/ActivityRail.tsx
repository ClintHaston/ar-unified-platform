import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, type NotificationItem, type TaskItem } from '../../lib/api'
import { readRecent, recentPath, type RecentItem } from '../../lib/recentlyViewed'
import { Icon } from './icons'

// Right-hand activity rail (v1): composed entirely from data the client already
// fetches elsewhere — recent notifications, my due-today/overdue tasks, and a
// client-side recently-viewed list. No new endpoint. Refreshes on navigation.

function dueState(dueAt: string | null): { label: string; cls: string } {
  if (!dueAt) return { label: 'No due date', cls: '' }
  const due = new Date(dueAt); const today = new Date()
  const days = Math.floor((due.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86_400_000)
  if (days < 0) return { label: `Overdue · ${new Date(dueAt).toLocaleDateString()}`, cls: 'over' }
  if (days === 0) return { label: 'Due today', cls: 'due' }
  return { label: `Due ${new Date(dueAt).toLocaleDateString()}`, cls: '' }
}

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function ActivityRail() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [notifs, setNotifs] = useState<NotificationItem[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [recent, setRecent] = useState<RecentItem[]>([])

  useEffect(() => {
    let live = true
    api.notifications().then((r) => { if (live) setNotifs(r.notifications.slice(0, 4)) }).catch(() => undefined)
    api.myTasks().then((r) => {
      if (!live) return
      // due-today / overdue first
      const sorted = [...r.tasks].sort((a, b) => {
        const da = a.due_at ? new Date(a.due_at).getTime() : Infinity
        const db = b.due_at ? new Date(b.due_at).getTime() : Infinity
        return da - db
      })
      setTasks(sorted.slice(0, 5))
    }).catch(() => undefined)
    setRecent(readRecent())
    return () => { live = false }
  }, [pathname])

  return (
    <aside className="ws-rail" aria-label="Activity">
      <div className="ws-rail-sect">
        <h4><Icon name="tasks" size={13} /> My tasks {tasks.length > 0 && <span className="ws-count">{tasks.length}</span>}</h4>
        {tasks.length === 0 ? (
          <div className="ws-rail-empty">No open tasks.</div>
        ) : tasks.map((t) => {
          const d = dueState(t.due_at)
          return (
            <button
              key={t.id}
              className={`ws-rail-item ${d.cls}`}
              onClick={() => t.deal_id && navigate(`/deals/${t.deal_id}`)}
            >
              <div className="ws-ri-title">{t.title}</div>
              <div className="ws-ri-sub">
                {d.label}{t.deal_name ? ` · ${t.deal_name}` : t.unit_title ? ` · ${t.unit_title}` : ''}
              </div>
            </button>
          )
        })}
      </div>

      <div className="ws-rail-sect">
        <h4><Icon name="activity" size={13} /> Notifications</h4>
        {notifs.length === 0 ? (
          <div className="ws-rail-empty">Nothing recent.</div>
        ) : notifs.map((n) => (
          <button
            key={n.id}
            className="ws-rail-item"
            onClick={() => { if (n.link) navigate(n.link) }}
          >
            <div className="ws-ri-title">{n.subject}</div>
            <div className="ws-ri-sub">{ago(n.created_at)}{n.body ? ` · ${n.body}` : ''}</div>
          </button>
        ))}
      </div>

      <div className="ws-rail-sect">
        <h4><Icon name="clock" size={13} /> Recently viewed</h4>
        {recent.length === 0 ? (
          <div className="ws-rail-empty">Pages you open appear here.</div>
        ) : recent.map((r) => (
          <button key={`${r.kind}-${r.id}`} className="ws-rail-item" onClick={() => navigate(recentPath(r))}>
            <div className="ws-ri-title">{r.label}</div>
            <div className="ws-ri-sub" style={{ textTransform: 'capitalize' }}>{r.kind === 'buyop' ? 'buy opp' : r.kind}</div>
          </button>
        ))}
      </div>
    </aside>
  )
}
