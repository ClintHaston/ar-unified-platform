import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type DashboardKpis, type TaskItem } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

function money(cents: number): string {
  const dollars = cents / 100
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}K`
  return `$${Math.round(dollars)}`
}

function dueLabel(dueAt: string | null): { text: string; color: string } {
  if (!dueAt) return { text: 'No due date', color: 'var(--p-body)' }
  const due = new Date(dueAt)
  const today = new Date()
  const dayDiff = Math.floor(
    (due.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86_400_000
  )
  if (dayDiff < 0) return { text: `Overdue (${new Date(dueAt).toLocaleDateString()})`, color: '#B4432B' }
  if (dayDiff === 0) return { text: 'Due today', color: 'var(--p-gold)' }
  return { text: new Date(dueAt).toLocaleDateString(), color: 'var(--p-body)' }
}

export function Dashboard() {
  const { user } = useAuth()
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [completing, setCompleting] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([api.dashboard(), api.myTasks()])
      .then(([k, t]) => {
        setKpis(k)
        setTasks(t.tasks)
        setError('')
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function complete(taskId: string) {
    setCompleting(taskId)
    try {
      await api.completeTask(taskId)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete task')
    } finally {
      setCompleting(null)
    }
  }

  if (loading) return <div className="admin-loading">Loading dashboard…</div>
  if (error && !kpis) return <div className="admin-loading">{error}</div>
  if (!kpis) return null

  const mine = kpis.scope === 'mine'
  const kpiCards = [
    {
      l: mine ? 'My pipeline value' : 'Open pipeline value',
      v: money(kpis.pipeline_value_cents),
      s: `${kpis.open_deals} active deals`,
    },
    {
      l: mine ? 'My weighted forecast' : 'Weighted forecast',
      v: money(kpis.weighted_forecast_cents),
      s: 'by stage probability',
    },
    {
      l: mine ? 'My win rate' : 'Win rate',
      v: kpis.win_rate_pct === null ? '—' : `${kpis.win_rate_pct}%`,
      s: kpis.closed_deals ? `${kpis.closed_deals} closed deals` : 'no closed deals yet',
    },
    {
      l: 'Tasks due today',
      v: String(kpis.tasks_due_today),
      s: kpis.tasks_overdue ? `${kpis.tasks_overdue} overdue` : 'none overdue',
    },
  ]

  return (
    <div>
      <div className="kpis">
        {kpiCards.map((k) => (
          <div className="kpi" key={k.l}>
            <div className="l">{k.l}</div>
            <div className="v">{k.v}</div>
            <div className="s">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>My tasks{user ? ` — ${user.name}` : ''}</h3>
        {tasks.length === 0 ? (
          <div className="note">No open tasks. The due-today view is a query over tasks, per the data model.</div>
        ) : (
          <table className="plat-table">
            <thead>
              <tr><th>Task</th><th>Linked to</th><th>Due</th><th></th></tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const due = dueLabel(t.due_at)
                return (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td>
                      {t.deal_id ? (
                        <Link to={`/deals/${t.deal_id}`} style={{ color: 'var(--p-gold)', fontWeight: 'bold' }}>
                          {t.deal_name ?? 'Deal'}
                        </Link>
                      ) : t.unit_title ? (
                        <span>{t.unit_title}</span>
                      ) : (
                        <span style={{ color: 'var(--p-body)' }}>—</span>
                      )}
                    </td>
                    <td style={{ color: due.color, fontWeight: due.text === 'Due today' ? 'bold' : undefined }}>
                      {due.text}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="plat-btn ghost"
                        disabled={completing === t.id}
                        onClick={() => complete(t.id)}
                      >
                        {completing === t.id ? 'Saving…' : 'Complete'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      </div>
    </div>
  )
}
