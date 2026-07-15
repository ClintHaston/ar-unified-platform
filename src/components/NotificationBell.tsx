import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type NotificationItem } from '../lib/api'

// Topbar notification bell (build step 3c-6). Unread badge + dropdown over
// platform.notifications; clicking an item marks it read and deep-links.
// Polls on an interval so a stage move or stall alert lands without a
// reload — ten users, one cheap indexed count query, no websockets needed.

const POLL_MS = 60_000

function age(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

const KIND_PILL: Record<string, string> = {
  stage_entry: 'gold',
  stall_alert: 'red',
  system: 'grey',
}

export function NotificationBell() {
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [open, setOpen] = useState(false)
  const [marking, setMarking] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    api.notifications()
      .then((res) => { setUnread(res.unread); setItems(res.notifications) })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  function toggle() {
    setOpen((v) => {
      if (!v) load()
      return !v
    })
  }

  async function openItem(n: NotificationItem) {
    setOpen(false)
    if (!n.read_at) {
      setUnread((u) => Math.max(0, u - 1))
      setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      api.markNotificationRead(n.id).catch(() => undefined)
    }
    if (n.link) navigate(n.link)
  }

  async function markAll() {
    setMarking(true)
    try {
      await api.markAllNotificationsRead()
      load()
    } finally {
      setMarking(false)
    }
  }

  return (
    <div className="bell" ref={boxRef}>
      <button className="bell-btn" onClick={toggle} aria-label={`Notifications (${unread} unread)`}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-drop">
          <div className="bell-head">
            <span>Notifications</span>
            {unread > 0 && (
              <button className="bell-markall" onClick={markAll} disabled={marking}>
                {marking ? '…' : 'Mark all read'}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="bell-empty">Nothing yet. Stage moves and stall alerts land here.</div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={`bell-item${n.read_at ? '' : ' unread'}`}
                onClick={() => openItem(n)}
              >
                <div className="bell-item-top">
                  <span className={`pill ${KIND_PILL[n.kind] ?? 'grey'}`}>
                    {n.kind === 'stage_entry' ? 'stage' : n.kind === 'stall_alert' ? 'stalled' : n.kind}
                  </span>
                  <b>{n.subject}</b>
                  <span className="bell-age">{age(n.created_at)}</span>
                </div>
                {n.body && <div className="bell-item-body">{n.body}</div>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
