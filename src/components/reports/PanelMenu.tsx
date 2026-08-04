import { useEffect, useRef, useState } from 'react'
import { PANEL_SIZES, type DashboardPanel, type FeedGroup, type PanelKind,
         type PanelSize } from '../../lib/api'

// The per-panel kebab: edit, resize, reorder, remove. Appears on hover, and on
// keyboard focus — a control that only exists under a mouse pointer does not
// exist for anyone navigating by keyboard.
//
// MOVE UP / MOVE DOWN ARE NOT REDUNDANT WITH DRAGGING. Drag-and-drop is the
// fast path; these two items are the accessible one. HTML5 DnD is mouse-only,
// so without them a keyboard user could add and size widgets but never arrange
// them, which is most of what composing a board is.
//
// EDIT IN PLACE (MYDAY_POLISH, 2026-08-04). A panel used to be a thing you
// could only move, resize or throw away: changing what a chart actually showed
// meant leaving the board, finding the report by name in the builder's saved
// list, and coming back. So this menu now opens the panel itself.
//
//   * A REPORT panel opens the builder loaded with its saved report. If the
//     viewer cannot edit that report — a team report somebody else owns — the
//     item becomes "Customize a copy" instead of being greyed out, because
//     "you may not edit this" is a true sentence that leaves a rep with
//     nowhere to go on their own dashboard.
//   * A COMPUTED panel has no report to open, so it gets its own options
//     inline: how the feed sections, how far back the KPI row looks, how many
//     tasks "Up next" shows. They are stored in that panel's config, so two
//     dashboards can answer differently. 'goal' has none by design — its
//     periods are the calendar's.

const WINDOW_CHOICES = [7, 14, 30, 60, 90, 180, 365]
const FEED_LIMIT_CHOICES = [10, 20, 30, 50, 100]
const TASK_LIMIT_CHOICES = [5, 10, 20]
const FEED_GROUPS: Array<{ key: FeedGroup; label: string }> = [
  { key: 'kind', label: 'By kind' },
  { key: 'day', label: 'By day' },
]

interface Props {
  size: PanelSize
  label: string           // what this panel is, for the menu's accessible name
  isFirst: boolean
  isLast: boolean
  onSize: (size: PanelSize) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  /** The panel's STORED shape, so its options show their current values. From
   *  the dashboard meta, not from the run response — run panels report only
   *  kind/size/report-id and a config read from there would be blank. */
  panel: DashboardPanel
  /** Computed panels: persist an option change. */
  onConfig?: (patch: Partial<DashboardPanel>) => void
  /** Report panels the viewer may edit: open the builder on this report. */
  onEditChart?: () => void
  /** Report panels the viewer may NOT edit: clone it to their ownership and
   *  point THIS panel at the clone. */
  onCustomizeCopy?: () => void
}

export function PanelMenu({ size, label, isFirst, isLast, onSize, onMove,
                            onRemove, panel, onConfig, onEditChart,
                            onCustomizeCopy }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const kind: PanelKind = panel.kind ?? 'report'

  // Close on outside click or Escape. Focus stays inside the menu while it is
  // open, so an outside pointerdown is genuinely "I am done here".
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false) }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function act(fn: () => void) {
    fn()
    setOpen(false)
  }

  // An option change leaves the menu OPEN — unlike every other item here, it is
  // a setting you may want to try twice ("30 days… no, 90"), and a menu that
  // shut on each attempt would have to be reopened to compare them.
  const set = (patch: Partial<DashboardPanel>) => onConfig?.(patch)

  const options = (
    <>
      {kind === 'kpis' && onConfig && (
        <label className="pm-opt">
          Window
          <select className="plat-input" value={panel.window ?? 30}
                  onChange={(e) => set({ window: Number(e.target.value) })}>
            {WINDOW_CHOICES.map((d) => (
              <option key={d} value={d}>Last {d} days</option>
            ))}
          </select>
        </label>
      )}
      {kind === 'activity_feed' && onConfig && (
        <>
          <div className="pm-head">Group by</div>
          <div className="roletoggle pm-sizes">
            {FEED_GROUPS.map((g) => (
              <button key={g.key} type="button" role="menuitemradio"
                      aria-checked={(panel.group ?? 'kind') === g.key}
                      className={(panel.group ?? 'kind') === g.key ? 'active' : ''}
                      onClick={() => set({ group: g.key })}>
                {g.label}
              </button>
            ))}
          </div>
          <label className="pm-opt">
            Show
            <select className="plat-input" value={panel.limit ?? 30}
                    onChange={(e) => set({ limit: Number(e.target.value) })}>
              {FEED_LIMIT_CHOICES.map((n) => (
                <option key={n} value={n}>{n} items</option>
              ))}
            </select>
          </label>
        </>
      )}
      {kind === 'tasks' && onConfig && (
        <label className="pm-opt">
          Show
          <select className="plat-input" value={panel.limit ?? 20}
                  onChange={(e) => set({ limit: Number(e.target.value) })}>
            {TASK_LIMIT_CHOICES.map((n) => (
              <option key={n} value={n}>{n} tasks</option>
            ))}
          </select>
        </label>
      )}
    </>
  )

  const hasOptions = onConfig
    && (kind === 'kpis' || kind === 'activity_feed' || kind === 'tasks')

  return (
    <div className="panel-menu" ref={wrap}>
      <button type="button" className="panel-kebab" aria-haspopup="menu"
              aria-expanded={open} aria-label={`Options for ${label}`}
              onClick={() => setOpen((v) => !v)}>
        ⋮
      </button>
      {open && (
        <div className="panel-menu-pop" role="menu" aria-label={`${label} options`}>
          {onEditChart && (
            <>
              <button type="button" role="menuitem" className="pm-item"
                      onClick={() => act(onEditChart)}>
                Edit chart
              </button>
              <div className="pm-sep" />
            </>
          )}
          {onCustomizeCopy && (
            <>
              <button type="button" role="menuitem" className="pm-item"
                      onClick={() => act(onCustomizeCopy)}>
                Customize a copy
              </button>
              <div className="pm-note">
                This chart belongs to someone else. A copy becomes yours to
                edit, and this panel switches to it.
              </div>
              <div className="pm-sep" />
            </>
          )}

          {hasOptions && (
            <>
              {options}
              <div className="pm-sep" />
            </>
          )}

          <div className="pm-head">Width</div>
          <div className="roletoggle pm-sizes">
            {PANEL_SIZES.map((s) => (
              <button key={s.key} type="button" role="menuitemradio"
                      aria-checked={size === s.key}
                      className={size === s.key ? 'active' : ''}
                      onClick={() => act(() => onSize(s.key))}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="pm-sep" />
          <button type="button" role="menuitem" className="pm-item"
                  disabled={isFirst} onClick={() => act(() => onMove(-1))}>
            Move up
          </button>
          <button type="button" role="menuitem" className="pm-item"
                  disabled={isLast} onClick={() => act(() => onMove(1))}>
            Move down
          </button>
          <div className="pm-sep" />
          <button type="button" role="menuitem" className="pm-item danger"
                  onClick={() => act(onRemove)}>
            Remove from dashboard
          </button>
        </div>
      )}
    </div>
  )
}
