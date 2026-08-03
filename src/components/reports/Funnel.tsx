import type { FunnelPipeline } from '../../lib/api'

// Funnel v2 (2026-08-02): a funnel that LOOKS like a funnel. Centered,
// tapering bars with depth that builds stage over stage, conversion drops
// called out between stages, money-big counts, a shine sweep on the winning
// stage, and staggered grow-in. These render on every rep's My Day all day —
// they earn the polish. No charting dependency; still plain divs + CSS.

function fmtDays(d: number | null): string {
  if (d === null) return '-'
  if (d < 1) return `${Math.round(d * 24)}h`
  return `${d}d`
}

const WIN_RE = /won|sold|signed/i
const LOSS_RE = /lost|rejected|removed/i

export function Funnel({ pipeline, accent }: { pipeline: FunnelPipeline; accent: string }) {
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
                {i > 0 && (s.conversion_from_prev_pct !== null || s.drop_from_prev > 0) && (
                  <div className="fnl-conv">
                    {s.conversion_from_prev_pct !== null && (
                      <span className="fnl-conv-pct">▼ {s.conversion_from_prev_pct}%</span>
                    )}
                    {s.drop_from_prev > 0 && (
                      <span className="fnl-conv-drop">{s.drop_from_prev} dropped</span>
                    )}
                  </div>
                )}
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
    </div>
  )
}
