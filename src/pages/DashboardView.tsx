import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Icon } from '../components/shell/icons'
import { api, type DashboardRun, type OwnerOption, type ReportFilters } from '../lib/api'
import { ResultView } from '../components/reports/ResultView'

// WS2c dashboard view. Composes a saved dashboard's panels by running each
// referenced report back through the 2b engine (server-side), with the
// dashboard-level date/owner filters overlaid. A panel whose report was
// deleted degrades to a friendly card, never a crash. Admin-only.

const PRESETS: Array<{ label: string; days: number | null }> = [
  { label: '30d', days: 30 }, { label: '90d', days: 90 },
  { label: '12mo', days: 365 }, { label: 'All', days: null },
]

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function panelAccent(run: DashboardRun['panels'][number]): string {
  const r = run.result
  if (r && r.viz === 'funnel' && r.pipelines[0]?.pipeline_name?.toLowerCase().includes('buyer')) {
    return 'var(--p-buy)'
  }
  return 'var(--p-gold)'
}

export function DashboardView() {
  const { dashboardId } = useParams<{ dashboardId: string }>()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [run, setRun] = useState<DashboardRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [initialized, setInitialized] = useState(false)

  // seed the filter bar from the dashboard's stored default filters, once
  useEffect(() => {
    if (!isAdmin || !dashboardId) return
    api.contactOwners().then((r) => setOwners(r.owners)).catch(() => setOwners([]))
    api.dashboardMeta(dashboardId).then((meta) => {
      setStart(meta.default_filters?.date?.start ?? '')
      setEnd(meta.default_filters?.date?.end ?? '')
      setOwnerId(meta.default_filters?.owner_id ?? '')
    }).catch(() => undefined).finally(() => setInitialized(true))
  }, [isAdmin, dashboardId])

  const load = useCallback(() => {
    if (!dashboardId) return
    const filters: ReportFilters = {
      start: start || undefined, end: end || undefined, owner_id: ownerId || undefined,
    }
    setLoading(true)
    api.runDashboard(dashboardId, filters)
      .then((res) => { setRun(res); setError('') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [dashboardId, start, end, ownerId])

  useEffect(() => { if (initialized) load() }, [initialized, load])

  async function toggleFavorite() {
    if (!run || !dashboardId) return
    const next = !run.favorited
    setRun({ ...run, favorited: next })   // optimistic
    try {
      if (next) await api.favoriteDashboard(dashboardId)
      else await api.unfavoriteDashboard(dashboardId)
    } catch {
      setRun((cur) => (cur ? { ...cur, favorited: !next } : cur))
    }
  }

  function applyPreset(days: number | null) {
    setEnd('')
    setStart(days === null ? '' : isoDaysAgo(days))
  }

  const panels = useMemo(() => run?.panels ?? [], [run])

  if (!isAdmin) {
    return (
      <div className="ws-placeholder">
        <div className="ws-ph-ic"><Icon name="dashboard" size={26} /></div>
        <h2>Dashboards are admin-only</h2>
        <p>Ask an admin for saved reporting dashboards.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="panel" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to="/reports" className="back-link" style={{ marginRight: 4 }}>← Reports</Link>
          <h2 style={{ fontSize: 18, margin: 0, color: 'var(--p-navy-dark)' }}>{run?.name ?? 'Dashboard'}</h2>
          <button className="ws-star" onClick={toggleFavorite} title={run?.favorited ? 'Unfavorite' : 'Favorite'}
                  aria-pressed={run?.favorited ? true : false}>
            <Icon name={run?.favorited ? 'star-filled' : 'star'} size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--p-body)' }}>From</span>
          <input type="date" className="plat-input" style={{ marginBottom: 0, width: 'auto' }}
                 value={start} onChange={(e) => setStart(e.target.value)} />
          <span style={{ fontSize: 12, color: 'var(--p-body)' }}>to</span>
          <input type="date" className="plat-input" style={{ marginBottom: 0, width: 'auto' }}
                 value={end} onChange={(e) => setEnd(e.target.value)} />
          <div className="roletoggle">
            {PRESETS.map((p) => <button key={p.label} onClick={() => applyPreset(p.days)}>{p.label}</button>)}
          </div>
          <select className="plat-input" style={{ marginBottom: 0, width: 'auto', maxWidth: 200 }}
                  value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">All reps</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.is_active ? o.name : `${o.name} (inactive)`}</option>)}
          </select>
          <span style={{ fontSize: 11, color: 'var(--p-body)' }}>Dashboard filters override each report.</span>
        </div>
      </div>

      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      {loading && !run && <div className="admin-loading">Loading dashboard…</div>}

      {run && panels.length === 0 && (
        <div className="panel"><div className="note">This dashboard has no panels yet. Add saved reports from the Reports → Dashboards tab.</div></div>
      )}

      <div className="dash-grid">
        {panels.map((p, i) => (
          <div key={`${p.saved_report_id}-${i}`} className={`dash-panel${p.size === 'half' ? ' half' : ''}`}>
            <div className="dash-panel-head">{p.name ?? 'Removed report'}</div>
            {p.error ? (
              <div className="panel"><div className="note">{p.error}</div></div>
            ) : p.result ? (
              <ResultView result={p.result} accent={panelAccent(p)} />
            ) : (
              <div className="admin-loading">…</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
