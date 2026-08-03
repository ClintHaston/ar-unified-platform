import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Icon } from '../components/shell/icons'
import { api, type DashboardRun, type OwnerOption, type ReportFilters,
         type MyKpis, type ActivityFeedResult, type RunResult,
         type UpNextResult } from '../lib/api'
import { ResultView } from '../components/reports/ResultView'
import { KpiRow, ActivityFeed } from '../components/reports/MyDayPanels'
import { UpNextPanel } from '../components/reports/UpNextPanel'
import { companyTz, todayIn } from '../components/reports/companyTz'
import { useToast } from '../components/shell/ToastContext'
import { useQuickLog } from '../components/quicklog/QuickLogContext'

// WS2c dashboard view. Composes a saved dashboard's panels by running each
// referenced report back through the 2b engine (server-side), with the
// dashboard-level date/owner filters overlaid. A panel whose report was
// deleted degrades to a friendly card, never a crash. Open to every member
// since the rep-dashboards build: the server scopes panels to the viewer.

// The days-back presets are open-ended ("since X", no end bound). Today is the
// odd one out: it is a BOUNDED single day, so it carries its own flag rather
// than pretending to be a days-back offset.
type Preset = { label: string; days: number | null; today?: boolean }
const PRESETS: Preset[] = [
  { label: 'Today', days: null, today: true },
  { label: '30d', days: 30 }, { label: '90d', days: 90 },
  { label: '12mo', days: 365 }, { label: 'All', days: null },
]

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function panelAccent(run: DashboardRun['panels'][number]): string {
  // Only 'report' panels carry a RunResult; computed panels never reach here.
  const r = (run.kind ?? 'report') === 'report' ? (run.result as RunResult | undefined) : undefined
  if (r && r.viz === 'funnel' && r.pipelines[0]?.pipeline_name?.toLowerCase().includes('buyer')) {
    return 'var(--p-buy)'
  }
  return 'var(--p-gold)'
}

export function DashboardView() {
  const { dashboardId } = useParams<{ dashboardId: string }>()
  const { user } = useAuth()
  const toast = useToast()
  const { logVersion } = useQuickLog()
  const isAdmin = user?.role === 'admin'

  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [run, setRun] = useState<DashboardRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [isDefault, setIsDefault] = useState(false)

  // Is THIS dashboard the user's default? The server resolves the default, so a
  // stale/deleted one comes back null and this is simply false.
  useEffect(() => {
    if (!dashboardId) { setIsDefault(false); return }
    let live = true
    api.defaultDashboard()
      .then((r) => { if (live) setIsDefault(r.default?.dashboard_id === dashboardId) })
      .catch(() => { if (live) setIsDefault(false) })
    return () => { live = false }
  }, [isAdmin, dashboardId])

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

  // Reload when something was logged anywhere in the app. A rep who logs a
  // call from the quick-log modal and watches their feed not change concludes
  // the log did not save — so the feed, Up next and the KPI counts refresh on
  // the same signal. `logVersion` only moves on a SUCCESSFUL write, so this
  // cannot spin.
  useEffect(() => { if (initialized) load() }, [initialized, load, logVersion])

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

  // Default is NOT favorite: favorites are many, the default is the single one
  // you land on. Toggling one must never touch the other.
  async function toggleDefault() {
    if (!dashboardId) return
    const next = !isDefault
    setIsDefault(next)                    // optimistic
    try {
      await api.setDefaultDashboard(next ? dashboardId : null)
      toast.info(next ? 'Set as your default dashboard' : 'Default dashboard cleared',
                 next ? 'It loads when you open the app.' : 'You will land on the main dashboard.')
    } catch (e) {
      setIsDefault(!next)
      toast.error('Could not change your default',
                  e instanceof Error ? e.message : 'Please try again.')
    }
  }

  async function applyPreset(p: Preset) {
    if (p.today) {
      // Today = start and end BOTH set to today's date in the company timezone.
      // The server reads those dates in that same timezone, so the window runs
      // local midnight to local midnight. Sending the browser's date, or letting
      // the server read UTC, would put the boundary 5-6 hours out.
      const d = todayIn(await companyTz())
      setStart(d)
      setEnd(d)
      return
    }
    setEnd('')
    setStart(p.days === null ? '' : isoDaysAgo(p.days))
  }

  const panels = useMemo(() => run?.panels ?? [], [run])

  // Reps see dashboards now (2026-08-02 rep-dashboards build). The server
  // scopes every panel to the viewer, so the same dashboard shows a rep their
  // own book and an admin the whole one.

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
          {/* Separate control from the star on purpose: a favorite is one of
              many, a default is the single one you land on. */}
          <button className="plat-btn ghost" onClick={toggleDefault}
                  aria-pressed={isDefault}
                  title={isDefault
                    ? 'This is the dashboard you land on. Click to stop landing here.'
                    : 'Land on this dashboard when you open the app'}>
            {isDefault ? 'Default for me' : 'Set as default'}
          </button>
          {isDefault && <span className="pill gold">You land here</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--p-body)' }}>From</span>
          <input type="date" className="plat-input" style={{ marginBottom: 0, width: 'auto' }}
                 value={start} onChange={(e) => setStart(e.target.value)} />
          <span style={{ fontSize: 12, color: 'var(--p-body)' }}>to</span>
          <input type="date" className="plat-input" style={{ marginBottom: 0, width: 'auto' }}
                 value={end} onChange={(e) => setEnd(e.target.value)} />
          <div className="roletoggle">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => { void applyPreset(p) }}>{p.label}</button>
            ))}
          </div>
          {isAdmin ? (
            <select className="plat-input" style={{ marginBottom: 0, width: 'auto', maxWidth: 200 }}
                    value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">All reps</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.is_active ? o.name : `${o.name} (inactive)`}</option>)}
            </select>
          ) : (
            <span className="pill" title="Your dashboards always show your own book">Mine</span>
          )}
          <span style={{ fontSize: 11, color: 'var(--p-body)' }}>Dashboard filters override each report.</span>
        </div>
      </div>

      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      {loading && !run && <div className="admin-loading">Loading dashboard…</div>}

      {run && panels.length === 0 && (
        <div className="panel"><div className="note">This dashboard has no panels yet. Add saved reports from the Reports → Dashboards tab.</div></div>
      )}

      <div className="dash-grid">
        {panels.map((p, i) => {
          const kind = p.kind ?? 'report'
          const head = kind === 'kpis' ? 'My numbers'
            : kind === 'activity_feed' ? 'Recent activity'
            : kind === 'tasks' ? 'Up next'
            : (p.name ?? 'Removed report')
          return (
            <div key={`${kind}-${p.saved_report_id ?? 'x'}-${i}`}
                 className={`dash-panel${p.size === 'half' ? ' half' : ''}`}>
              {/* The kpis panel carries its own hero header — a second label
                  above a greeting reads like furniture. */}
              {kind !== 'kpis' && <div className="dash-panel-head">{head}</div>}
              {p.error ? (
                <div className="panel"><div className="note">{p.error}</div></div>
              ) : kind === 'kpis' && p.result ? (
                <KpiRow data={p.result as MyKpis} />
              ) : kind === 'activity_feed' && p.result ? (
                <ActivityFeed data={p.result as ActivityFeedResult} />
              ) : kind === 'tasks' && p.result ? (
                <UpNextPanel data={p.result as UpNextResult} />
              ) : p.result ? (
                // The panel's EFFECTIVE definition (saved report + this
                // dashboard's date/owner overrides), so a drill returns the
                // population the panel actually rendered.
                <ResultView result={p.result as RunResult} accent={panelAccent(p)} definition={p.definition} />
              ) : (
                <div className="admin-loading">…</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
