import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type DashboardPanel, type PanelKind, type PanelSize,
         type SavedReport } from '../../lib/api'

// AddWidgetDrawer — the widget library. Everything you can put on a dashboard,
// in one place: the four server-computed widgets, every saved report you can
// see (yours plus the team's), and a door to the builder for a chart that does
// not exist yet.
//
// WHY THE BUILDER'S VIZ TYPES ARE THE BADGES. A saved report already knows
// what shape it draws. Showing that shape as a badge is the difference between
// picking a widget and reading a list of names — a rep composing a board is
// thinking "I want a pie here", not "I want 'Q3 outcome mix' here".
//
// Modal shell reuses the shipped .ws-modal-* idiom (scrim, Escape, click
// outside) so this is not a second modal language.

interface ComputedWidget {
  kind: Exclude<PanelKind, 'report'>
  name: string
  blurb: string
  size: PanelSize          // the size this widget is actually designed for
}

// Sizes here are defaults, not constraints — every widget can be resized once
// it is on the board. They are the size each one reads best at, so a widget
// lands looking right rather than landing wrong and needing a fix.
const COMPUTED: ComputedWidget[] = [
  { kind: 'kpis', name: 'KPI row', size: 'full',
    blurb: 'Your headline numbers with trend deltas against the previous window.' },
  { kind: 'tasks', name: 'Up next', size: 'half',
    blurb: 'Open tasks due today or already overdue. Tick them off in place.' },
  { kind: 'goal', name: 'Goal gauge', size: 'half',
    blurb: 'Won-value this month against your target, plus calls this week.' },
  { kind: 'activity_feed', name: 'Activity feed', size: 'full',
    blurb: 'Everything you logged recently, newest first.' },
]

// The builder's nine shapes, labelled for a badge. Anything unrecognised falls
// back to its own raw key rather than to a wrong label.
const VIZ_LABEL: Record<string, string> = {
  table: 'Table', bar: 'Bar', number: 'Metric', stacked_bar: 'Stacked bar',
  grouped_bar: 'Grouped bar', line: 'Line', donut: 'Donut', pie: 'Pie',
  scatter: 'Scatter', scatter_records: 'Scatter', combo: 'Combo',
  gauge: 'Gauge', funnel: 'Funnel',
}

// Report panels that draw a single figure sit happily in a third; a table or a
// funnel needs room to be readable. Same principle as the computed defaults.
const NARROW_VIZ = new Set(['number', 'gauge', 'donut', 'pie'])

function defaultSizeFor(viz: string): PanelSize {
  if (NARROW_VIZ.has(viz)) return 'third'
  if (viz === 'table' || viz === 'funnel') return 'full'
  return 'half'
}

interface Props {
  /** Kinds already on the board, so the drawer can say so. Adding a second one
   *  is allowed — a rep may want two goal gauges is unlikely, but forbidding it
   *  would be the drawer overruling the board's owner. */
  present: DashboardPanel[]
  dashboardId: string
  onAdd: (panel: DashboardPanel) => void
  onClose: () => void
}

export function AddWidgetDrawer({ present, dashboardId, onAdd, onClose }: Props) {
  const navigate = useNavigate()
  const [reports, setReports] = useState<SavedReport[] | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    api.savedReports().then((r) => setReports(r.reports)).catch(() => setReports([]))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onBoard = useMemo(
    () => new Set(present.map((p) => p.kind ?? 'report')), [present])
  const reportsOnBoard = useMemo(
    () => new Set(present.filter((p) => (p.kind ?? 'report') === 'report')
                         .map((p) => p.saved_report_id)), [present])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!reports) return []
    if (!needle) return reports
    return reports.filter((r) =>
      r.name.toLowerCase().includes(needle) ||
      (VIZ_LABEL[r.definition.viz] ?? r.definition.viz).toLowerCase().includes(needle))
  }, [reports, q])

  function addComputed(w: ComputedWidget) {
    onAdd({ kind: w.kind, size: w.size })
  }

  function addReport(r: SavedReport) {
    onAdd({ kind: 'report', saved_report_id: r.id,
            size: defaultSizeFor(r.definition.viz) })
  }

  // The builder is a full page, not a nested modal — so this is a navigation,
  // and `from` is what brings the rep back to the board they were composing
  // once they save. Losing your place mid-compose is how a builder stops being
  // used.
  function buildNew() {
    navigate(`/reports?tab=custom&from=${encodeURIComponent(`/dashboards/${dashboardId}`)}`)
  }

  return (
    <div className="ws-modal-scrim" onMouseDown={onClose} role="presentation">
      <div className="ws-modal panel widget-drawer" role="dialog" aria-modal="true"
           aria-label="Add a widget" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ws-modal-head">
          <h3>Add a widget</h3>
          <button type="button" className="plat-btn ghost" onClick={onClose}>Close</button>
        </div>

        <div className="wd-sect">Your numbers</div>
        <div className="wd-grid">
          {COMPUTED.map((w) => (
            <button key={w.kind} type="button" className="wd-card"
                    onClick={() => addComputed(w)}>
              <span className="wd-card-h">
                <b>{w.name}</b>
                {onBoard.has(w.kind) && <span className="wd-on">on board</span>}
              </span>
              <span className="wd-card-b">{w.blurb}</span>
            </button>
          ))}
        </div>

        <div className="wd-sect">
          Saved reports
          <input className="plat-input wd-search" placeholder="Filter by name or shape…"
                 value={q} onChange={(e) => setQ(e.target.value)}
                 aria-label="Filter saved reports" />
        </div>

        {reports === null ? (
          <div className="admin-loading">Loading reports…</div>
        ) : reports.length === 0 ? (
          <div className="note">
            No saved reports yet — build the first one and it lands here.
          </div>
        ) : filtered.length === 0 ? (
          <div className="note">Nothing matches “{q}”.</div>
        ) : (
          <div className="wd-grid">
            {filtered.map((r) => (
              <button key={r.id} type="button" className="wd-card"
                      onClick={() => addReport(r)}>
                <span className="wd-card-h">
                  <b>{r.name}</b>
                  <span className="wd-viz">{VIZ_LABEL[r.definition.viz] ?? r.definition.viz}</span>
                </span>
                <span className="wd-card-b">
                  {r.owner_name ? `${r.owner_name} · ` : ''}
                  {reportsOnBoard.has(r.id) ? 'already on this board' : 'scoped to whoever opens it'}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="ws-modal-foot">
          <span className="note wd-hint">
            Widgets land at the bottom. Drag them where you want them.
          </span>
          <button type="button" className="plat-btn" onClick={buildNew}>
            Build a new chart →
          </button>
        </div>
      </div>
    </div>
  )
}
