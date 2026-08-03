// MyDayPanels — the two computed dashboard panel kinds from the rep-dashboards
// build (2026-08-02): the KPI card row and the activity feed. Both arrive
// pre-computed on the dashboard /run payload (the server scoped them to the
// viewer already), so these are pure presentation. Retheme tokens only.
import { Link } from 'react-router-dom'
import type { MyKpis, ActivityFeedResult, FeedItem } from '../../lib/api'

const money = (cents: number) =>
  '$' + Math.round(cents / 100).toLocaleString()

const KPI_CARDS: { key: keyof MyKpis; label: string; render?: (v: number) => string }[] = [
  { key: 'open_pipeline_cents', label: 'Open pipeline', render: money },
  { key: 'weighted_pipeline_cents', label: 'Weighted pipeline', render: money },
  { key: 'win_rate', label: 'Win rate', render: (v) => `${Math.round(v * 100)}%` },
  { key: 'avg_days_to_close', label: 'Avg days to close', render: (v) => v.toFixed(0) },
  { key: 'calls', label: 'Calls' },
  { key: 'emails', label: 'Emails' },
  { key: 'tasks_due_today', label: 'Tasks due today' },
  { key: 'stale_deals', label: 'Stale deals' },
]

export function KpiRow({ data }: { data: MyKpis }) {
  return (
    <div className="kpi-row">
      {KPI_CARDS.map((c) => {
        const raw = data[c.key]
        const empty = raw === null || raw === undefined
        return (
          <div key={String(c.key)} className="kpi-card">
            <div className="kpi-value">
              {empty ? '—' : c.render ? c.render(raw as number) : String(raw)}
            </div>
            <div className="kpi-label">{c.label}</div>
          </div>
        )
      })}
      <div className="kpi-window">last {data.window_days} days</div>
    </div>
  )
}

const KIND_ICON: Record<string, string> = {
  call: '📞', email: '✉️', note: '📝', meeting: '🤝', task: '✅',
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function feedLink(it: FeedItem): string | null {
  if (it.deal_id) return `/deals/${it.deal_id}`
  if (it.buyer_opportunity_id) return `/buyers/${it.buyer_opportunity_id}`
  if (it.contact_id) return `/contacts/${it.contact_id}`
  if (it.unit_id) return `/units/${it.unit_id}`
  return null
}

export function ActivityFeed({ data }: { data: ActivityFeedResult }) {
  if (!data.items.length) {
    return (
      <div className="note" style={{ padding: '14px 16px' }}>
        Nothing logged yet. Calls, emails, and notes you log on deals and
        contacts show up here.
      </div>
    )
  }
  return (
    <div className="feed-list">
      {data.items.map((it) => {
        const to = feedLink(it)
        const body = (
          <>
            <span className="feed-ic" aria-hidden>{KIND_ICON[it.kind] ?? '•'}</span>
            <span className="feed-subject">
              {it.subject || it.kind}
              {it.call_outcome ? <span className="feed-outcome"> · {it.call_outcome}</span> : null}
            </span>
            <span className="feed-when">{ago(it.occurred_at)}</span>
          </>
        )
        return to
          ? <Link key={it.id} to={to} className="feed-item">{body}</Link>
          : <div key={it.id} className="feed-item">{body}</div>
      })}
    </div>
  )
}
