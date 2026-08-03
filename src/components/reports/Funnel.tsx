import { useState } from 'react'
import type { FunnelPipeline, FunnelStage } from '../../lib/api'
import { StageDrillPopup } from './StageDrillPopup'

// Funnel v2 (2026-08-02): a funnel that LOOKS like a funnel. Centered,
// tapering bars with depth that builds stage over stage, conversion drops
// called out between stages, money-big counts, a shine sweep on the winning
// stage, and staggered grow-in. These render on every rep's My Day all day —
// they earn the polish. No charting dependency; still plain divs + CSS.
//
// DRILL_USERS (2026-08-03): a stage is now a button. Clicking it lists WHO IS
// IN IT right now — the question the bar makes you ask and, until now, the one
// thing the funnel could not answer. The popup owns the fetch; this component
// only says which stage was clicked and hands the funnel's own filters through
// so the drill and the bar are looking at the same book.

function fmtDays(d: number | null): string {
  if (d === null) return '-'
  if (d < 1) return `${Math.round(d * 24)}h`
  return `${d}d`
}

const WIN_RE = /won|sold|signed/i
const LOSS_RE = /lost|rejected|removed/i

interface Props {
  pipeline: FunnelPipeline
  accent: string
  // The window and owner the funnel itself was run with, so the drill matches
  // what is on screen. Omitted (My Day's undated funnels) means no window,
  // which is the honest answer for a current-state list anyway.
  start?: string
  end?: string
  ownerId?: string
}

export function Funnel({ pipeline, accent, start, end, ownerId }: Props) {
  const [drill, setDrill] = useState<FunnelStage | null>(null)
  const max = Math.max(1, ...pipeline.stages.map((s) => s.reached))
  const anyMovement = pipeline.stages.some((s) => s.reached > 0)
  const n = Math.max(1, pipeline.stages.length - 1)

  return (
    <div className="panel">
      <h3 style={{ marginBottom: 4 }}>{pipeline.pipeline_name}</h3>
      {!anyMovement ? (
        <div className="note">No stage movement in this window yet.</div>
      ) : (
        <div className="fnl">
          {pipeline.stages.map((s, i) => {
            const pct = (s.reached / max) * 100
            const width = s.reached > 0 ? Math.max(pct, 16) : 12
            const isWin = WIN_RE.test(s.name)
            const isLoss = LOSS_RE.test(s.name)
            // Depth builds as the funnel narrows — later stages are the ones
            // a salesman is fighting for, so they get the saturation.
            const depth = 0.6 + 0.4 * (i / n)
            return (
              <div key={s.stage_id} className="fnl-stage" style={{ animationDelay: `${i * 80}ms` }}>
                {i > 0 && (s.conversion_from_prev_pct !== null || (s.drop_from_prev ?? 0) > 0) && (
                  <div className="fnl-conv">
                    {s.conversion_from_prev_pct !== null && (
                      <span className="fnl-conv-pct">▼ {s.conversion_from_prev_pct}%</span>
                    )}
                    {(s.drop_from_prev ?? 0) > 0 && (
                      <span className="fnl-conv-drop">{s.drop_from_prev} dropped</span>
                    )}
                  </div>
                )}
                {/* A button, not a div with onClick: this is keyboard-reachable
                    and announced as an action, which is the whole difference
                    between a chart and a chart you can use. EVERY stage is
                    clickable, including one the funnel counted zero for — the
                    bar counts entries in the window and the drill counts who
                    is in there now, so "0" above does not mean "empty". */}
                <button type="button" className="fnl-hit"
                        onClick={() => setDrill(s)}
                        title={`See who is in ${s.name} right now`}
                        aria-label={`See who is in ${s.name} right now`}>
                  <div className="fnl-row">
                    <span className="fnl-name">{s.name}</span>
                    <span className={`fnl-count bebas${s.reached === 0 ? ' zero' : ''}`}>{s.reached}</span>
                  </div>
                  <div className="fnl-track">
                    <div
                      className={`fnl-bar${isWin ? ' win' : ''}${isLoss ? ' loss' : ''}${s.reached === 0 ? ' empty' : ''}`}
                      style={{
                        width: `${width}%`,
                        background: isLoss ? 'var(--p-blue-muted)' : accent,
                        opacity: s.reached === 0 ? 0.25 : depth,
                        animationDelay: `${i * 80}ms`,
                      }}
                    />
                  </div>
                </button>
                {(s.completed_visits > 0 || s.reached > 0) && (
                  <div className="fnl-meta">
                    {s.completed_visits > 0 && (
                      <span>{fmtDays(s.median_days_in_stage)} median in stage
                        {s.avg_days_in_stage !== null && ` · avg ${fmtDays(s.avg_days_in_stage)}`}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {drill && (
        <StageDrillPopup stageId={drill.stage_id}
                         start={start} end={end} ownerId={ownerId}
                         label={`${pipeline.pipeline_name} · ${drill.name}`}
                         onClose={() => setDrill(null)} />
      )}
    </div>
  )
}
