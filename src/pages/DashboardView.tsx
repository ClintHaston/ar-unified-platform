import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Icon } from '../components/shell/icons'
import { api, type DashboardRun, type DashboardPanel, type OwnerOption,
         type ReportFilters, type MyKpis, type ActivityFeedResult,
         type RunResult, type UpNextResult, type GoalResult,
         type PanelSize } from '../lib/api'
import { ResultView } from '../components/reports/ResultView'
import { KpiRow, ActivityFeed } from '../components/reports/MyDayPanels'
import { UpNextPanel } from '../components/reports/UpNextPanel'
import { GoalGauge } from '../components/reports/GoalGauge'
import { PanelMenu } from '../components/reports/PanelMenu'
import { AddWidgetDrawer } from '../components/reports/AddWidgetDrawer'
import { companyTz, todayIn } from '../components/reports/companyTz'
import { useToast } from '../components/shell/ToastContext'
import { useQuickLog } from '../components/quicklog/QuickLogContext'

// WS2c dashboard view. Composes a saved dashboard's panels by running each
// referenced report back through the 2b engine (server-side), with the
// dashboard-level date/owner filters overlaid. A panel whose report was
// deleted degrades to a friendly card, never a crash. Open to every member
// since the rep-dashboards build: the server scopes panels to the viewer.
//
// MY DAY v3 — COMPOSE IN PLACE. A dashboard is now a widget mosaic its owner
// rearranges here rather than in a separate builder screen. Three decisions
// worth keeping:
//
//   * The EDITED layout comes from the dashboard's stored meta, not from the
//     run response. Run panels report only kind/size/report-id, so rebuilding
//     a layout from them would drop each computed panel's stored config and a
//     90-day KPI window would silently re-clamp to 30 on the next save.
//   * Resize / reorder / remove apply LOCALLY and persist in the background:
//     they change nothing the server computes, so re-running the whole board
//     to watch a panel move would be a spinner in exchange for nothing. Adding
//     a widget does need a run — there is a new panel with no result yet.
//   * Editing controls are hidden when the server says can_edit is false, and
//     the server refuses the PATCH regardless. The UI hiding a control is a
//     courtesy; the server is the rule.

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

const PANEL_LABEL: Record<string, string> = {
  kpis: 'My numbers', activity_feed: 'Recent activity',
  tasks: 'Up next', goal: 'Goal',
}

function headingFor(p: DashboardRun['panels'][number]): string {
  const kind = p.kind ?? 'report'
  return PANEL_LABEL[kind] ?? p.name ?? 'Removed report'
}

/** Move an item within a list, returning a new list. Out-of-range moves return
 *  the list unchanged rather than wrapping — a panel at the top that jumps to
 *  the bottom on "move up" is a bug the user has to undo. */
function moved<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
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

  // Compose-in-place state.
  const [layout, setLayout] = useState<DashboardPanel[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

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

  // Seed the filter bar from the dashboard's stored default filters, and take
  // the stored layout + edit permission from the same read. Every member needs
  // this now (it carries can_edit), not just admins.
  useEffect(() => {
    if (!dashboardId) return
    if (isAdmin) api.contactOwners().then((r) => setOwners(r.owners)).catch(() => setOwners([]))
    api.dashboardMeta(dashboardId).then((meta) => {
      if (isAdmin) {
        setStart(meta.default_filters?.date?.start ?? '')
        setEnd(meta.default_filters?.date?.end ?? '')
        setOwnerId(meta.default_filters?.owner_id ?? '')
      }
      setLayout(meta.layout ?? [])
      setCanEdit(!!meta.can_edit)
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

  // ── Persisting a layout change ────────────────────────────────────────────
  // The local state has already moved; this is the write-behind. On failure the
  // caller's `revert` puts the board back, because a panel that springs back to
  // where it was is honest and a panel that stays moved while the server
  // disagrees is a lie the rep discovers on their next login.
  const saveLayout = useCallback(async (next: DashboardPanel[], revert: () => void) => {
    if (!dashboardId) return
    try {
      await api.updateDashboard(dashboardId, { layout: next })
    } catch (e) {
      revert()
      toast.error('Could not save that change',
                  e instanceof Error ? e.message : 'Please try again.')
    }
  }, [dashboardId, toast])

  // Panels and layout are index-aligned (the server returns one run panel per
  // stored panel, in order), so a local rearrangement moves both together and
  // the board updates without a refetch.
  const rearrange = useCallback((mutate: (l: DashboardPanel[]) => DashboardPanel[],
                                 mutateRun: (p: DashboardRun['panels']) => DashboardRun['panels']) => {
    const prevLayout = layout
    const prevRun = run
    const nextLayout = mutate(layout)
    if (nextLayout === prevLayout) return
    setLayout(nextLayout)
    if (run) setRun({ ...run, panels: mutateRun(run.panels) })
    void saveLayout(nextLayout, () => {
      setLayout(prevLayout)
      if (prevRun) setRun(prevRun)
    })
  }, [layout, run, saveLayout])

  const movePanel = useCallback((from: number, to: number) => {
    rearrange((l) => moved(l, from, to), (p) => moved(p, from, to))
  }, [rearrange])

  const setSize = useCallback((i: number, size: PanelSize) => {
    rearrange(
      (l) => l.map((p, idx) => (idx === i ? { ...p, size } : p)),
      (p) => p.map((x, idx) => (idx === i ? { ...x, size } : x)))
  }, [rearrange])

  const removePanel = useCallback((i: number) => {
    rearrange((l) => l.filter((_, idx) => idx !== i),
              (p) => p.filter((_, idx) => idx !== i))
  }, [rearrange])

  // Adding is the one change that needs the server: the new panel has no
  // computed result yet.
  const addPanel = useCallback(async (panel: DashboardPanel) => {
    if (!dashboardId) return
    const prev = layout
    const next = [...layout, panel]
    setLayout(next)
    setAdding(false)
    try {
      await api.updateDashboard(dashboardId, { layout: next })
      load()
      toast.info('Widget added', 'It landed at the bottom — drag it where you want it.')
    } catch (e) {
      setLayout(prev)
      toast.error('Could not add that widget',
                  e instanceof Error ? e.message : 'Please try again.')
    }
  }, [dashboardId, layout, load, toast])

  // Coming back from the builder with a freshly saved chart (?add=<report id>).
  // It waits for `initialized` because appending to a layout that has not
  // loaded yet would PATCH a one-panel board over the real one — the whole
  // dashboard, replaced by the chart just built.
  const [searchParams, setSearchParams] = useSearchParams()
  const pendingAdd = searchParams.get('add')
  const consumedAdd = useRef<string | null>(null)
  useEffect(() => {
    if (!pendingAdd || !initialized || !canEdit) return
    if (consumedAdd.current === pendingAdd) return
    consumedAdd.current = pendingAdd
    // Strip the param first so a refresh cannot add the panel a second time.
    setSearchParams({}, { replace: true })
    void addPanel({ kind: 'report', saved_report_id: pendingAdd, size: 'half' })
    setEditing(true)
  }, [pendingAdd, initialized, canEdit, addPanel, setSearchParams])

  // ── Drag to reorder ───────────────────────────────────────────────────────
  // HTML5 DnD, no dependency. It is mouse-only by nature, which is exactly why
  // the kebab carries Move up / Move down as the keyboard path.
  const dropDone = useRef(false)

  function onDragStart(i: number, e: React.DragEvent) {
    dropDone.current = false
    setDragFrom(i)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox refuses to start a drag without payload, even unused payload.
    e.dataTransfer.setData('text/plain', String(i))
  }

  function onDragOver(i: number, e: React.DragEvent) {
    if (dragFrom === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOver !== i) setDragOver(i)
  }

  function onDrop(i: number, e: React.DragEvent) {
    e.preventDefault()
    dropDone.current = true
    if (dragFrom !== null && dragFrom !== i) movePanel(dragFrom, i)
    setDragFrom(null); setDragOver(null)
  }

  function onDragEnd() {
    setDragFrom(null); setDragOver(null)
  }

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

          {/* Editing controls appear only for someone the SERVER says may edit;
              the PATCH is refused either way. */}
          {canEdit && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className={`plat-btn${editing ? '' : ' ghost'}`}
                      onClick={() => setEditing((v) => !v)}
                      aria-pressed={editing}
                      title="Rearrange, resize and remove widgets">
                {editing ? 'Done editing' : 'Edit layout'}
              </button>
              <button className="plat-btn" onClick={() => { setEditing(true); setAdding(true) }}>
                + Add widget
              </button>
            </div>
          )}
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
        {editing && (
          <div className="note dash-edit-hint">
            Drag a widget to move it, or use its ⋮ menu to resize, reorder or
            remove it. Changes save as you make them.
          </div>
        )}
      </div>

      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      {loading && !run && <div className="admin-loading">Loading dashboard…</div>}

      {run && panels.length === 0 && (
        <div className="panel">
          <div className="note">
            This dashboard has no widgets yet.{' '}
            {canEdit
              ? 'Add the first one and start composing.'
              : 'Its owner has not added any yet.'}
          </div>
          {canEdit && (
            <button className="plat-btn" style={{ marginTop: 10 }}
                    onClick={() => { setEditing(true); setAdding(true) }}>
              + Add widget
            </button>
          )}
        </div>
      )}

      <div className={`dash-grid${editing ? ' editing' : ''}`}>
        {panels.map((p, i) => {
          const kind = p.kind ?? 'report'
          const head = headingFor(p)
          const size = p.size ?? 'full'
          return (
            <div key={`${kind}-${p.saved_report_id ?? 'x'}-${i}`}
                 className={`dash-panel ${size}`
                   + (editing ? ' editable' : '')
                   + (dragFrom === i ? ' dragging' : '')
                   + (dragOver === i && dragFrom !== i ? ' drag-over' : '')}
                 draggable={editing}
                 onDragStart={editing ? (e) => onDragStart(i, e) : undefined}
                 onDragOver={editing ? (e) => onDragOver(i, e) : undefined}
                 onDrop={editing ? (e) => onDrop(i, e) : undefined}
                 onDragEnd={editing ? onDragEnd : undefined}>
              {/* The kpis panel carries its own hero header — a second label
                  above a greeting reads like furniture. In edit mode it gets
                  one anyway, because a widget you cannot grab by its title bar
                  is a widget you cannot move. */}
              {(kind !== 'kpis' || editing) && (
                <div className="dash-panel-head">
                  {editing && <span className="dash-grip" aria-hidden>⠿</span>}
                  {head}
                  {editing && (
                    <PanelMenu
                      size={size}
                      label={head}
                      isFirst={i === 0}
                      isLast={i === panels.length - 1}
                      onSize={(s) => setSize(i, s)}
                      onMove={(dir) => movePanel(i, i + dir)}
                      onRemove={() => removePanel(i)}
                    />
                  )}
                </div>
              )}
              {p.error ? (
                <div className="panel"><div className="note">{p.error}</div></div>
              ) : kind === 'kpis' && p.result ? (
                <KpiRow data={p.result as MyKpis} />
              ) : kind === 'activity_feed' && p.result ? (
                <ActivityFeed data={p.result as ActivityFeedResult} />
              ) : kind === 'tasks' && p.result ? (
                <UpNextPanel data={p.result as UpNextResult} />
              ) : kind === 'goal' && p.result ? (
                <GoalGauge data={p.result as GoalResult} />
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

      {adding && dashboardId && (
        <AddWidgetDrawer
          present={layout}
          dashboardId={dashboardId}
          onAdd={(panel) => { void addPanel(panel) }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}
