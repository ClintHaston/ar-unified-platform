import type { FunnelPipeline } from '../../lib/api'

// WS2a funnel: stage conversion (CSS bars, width proportional to how many
// entities reached the stage) plus days-in-stage. No charting dependency —
// bars are plain divs. accent is the sell (gold) or buy (teal) token.

function fmtDays(d: number | null): string {
  if (d === null) return '-'
  if (d < 1) return `${Math.round(d * 24)}h`
  return `${d}d`
}

export function Funnel({ pipeline, accent }: { pipeline: FunnelPipeline; accent: string }) {
  const max = Math.max(1, ...pipeline.stages.map((s) => s.reached))
  const anyMovement = pipeline.stages.some((s) => s.reached > 0)

  return (
    <div className="panel">
      <h3 style={{ marginBottom: 4 }}>{pipeline.pipeline_name}</h3>
      {!anyMovement ? (
        <div className="note">No stage movement in this window yet.</div>
      ) : (
        <div className="rep-funnel">
          {pipeline.stages.map((s) => (
            <div key={s.stage_id} className="rep-fstage">
              <div className="rep-fhead">
                <span className="rep-fname">{s.name}</span>
                <span className="rep-fcount">{s.reached}</span>
              </div>
              <div className="rep-ftrack">
                <div
                  className="rep-fbar"
                  style={{ width: `${(s.reached / max) * 100}%`, background: accent }}
                />
              </div>
              <div className="rep-fmeta">
                {s.conversion_from_prev_pct !== null && (
                  <span>{s.conversion_from_prev_pct}% from previous</span>
                )}
                {s.drop_from_prev ? <span>{s.drop_from_prev} dropped</span> : null}
                {s.completed_visits > 0 && (
                  <span>
                    {fmtDays(s.median_days_in_stage)} median in stage
                    {s.avg_days_in_stage !== null && ` (avg ${fmtDays(s.avg_days_in_stage)})`}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
