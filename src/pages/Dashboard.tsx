import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type BuyerBoardResponse, type DashboardKpis, type TaskItem } from '../lib/api'
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
  const navigate = useNavigate()
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [buyBoard, setBuyBoard] = useState<BuyerBoardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [completing, setCompleting] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([api.dashboard(), api.myTasks()])
      .then(([k, t]) => {
        setKpis(k)
        setTasks(t.tasks)
        setError('')
        // buy-side rollup scoped to match the KPI scope; its own catch so a
        // failure here never breaks the dashboard.
        api.buyerOpportunities({ mine: k.scope === 'mine' })
          .then(setBuyBoard)
          .catch(() => setBuyBoard(null))
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

      {buyBoard && (
        <div className="panel">
          <h3>
            Buy-side pipeline {mine ? '— mine' : '(all reps)'}
            <span className="pill buy" style={{ marginLeft: 8 }}>Buyer opportunities</span>
          </h3>
          {buyBoard.opportunities.length === 0 ? (
            <div className="note">
              No buyer opportunities yet.{' '}
              <Link to="/buyer-opportunities" style={{ color: 'var(--p-buy)', fontWeight: 'bold' }}>Open the buyer board →</Link>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {buyBoard.pipeline.stages.map((s) => {
                  const count = buyBoard.opportunities.filter((o) => o.stage_id === s.id).length
                  const max = Math.max(1, ...buyBoard.pipeline.stages.map((st) =>
                    buyBoard.opportunities.filter((o) => o.stage_id === st.id).length))
                  const h = 12 + Math.round((count / max) * 60)
                  return (
                    <div key={s.id} style={{ flex: 1, minWidth: 70, textAlign: 'center', cursor: 'pointer' }}
                         onClick={() => navigate('/buyer-opportunities')}>
                      <div style={{ height: 74, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                        <div style={{ background: 'var(--p-buy)', borderRadius: '5px 5px 0 0', height: h, color: '#fff',
                                      fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {count}
                        </div>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 10, fontWeight: 'bold', color: 'var(--p-body)' }}>{s.name}</div>
                    </div>
                  )
                })}
              </div>
              <div className="note">
                {buyBoard.opportunities.filter((o) => !o.outcome).length} open ·{' '}
                {buyBoard.opportunities.filter((o) => o.outcome === 'won').length} won ·{' '}
                {buyBoard.opportunities.filter((o) => o.outcome === 'lost').length} lost —
                buy-side interest, separate from the sell-side pipelines above.
              </div>
            </>
          )}
        </div>
      )}

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
