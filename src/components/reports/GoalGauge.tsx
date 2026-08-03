import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { api, type GoalResult } from '../../lib/api'
import { TargetsForm } from './TargetsForm'

// GoalGauge — the My Day v3 goal widget. A semicircle of closed-won progress
// against this month's target, with a second thin bar for this week's calls.
//
// WHY A SEMICIRCLE AND NOT A BAR. A quota is the one number a rep is measured
// on, and it earns a shape of its own so it cannot be mistaken for another KPI
// tile. Plain SVG, no charting dependency — the site already draws its funnels
// with divs and CSS, and a gauge is one arc.
//
// NO TARGET IS NOT ZERO PROGRESS. The server sends null for a target nobody
// has set, and this renders an invitation for that. A 0% arc would tell a rep
// their quota is nothing, which is a different — and untrue — statement. Only
// an admin can set one, and when an admin is looking at a specific person they
// can do it right here rather than going hunting for a settings screen.
//
// Motion sits behind prefers-reduced-motion, like everything else on My Day.

const R = 52                       // arc radius
const STROKE = 13
const W = 148                      // viewBox width  (2R + stroke + padding)
const H = 84                       // viewBox height (R + stroke + label room)
const CX = W / 2
const CY = R + STROKE / 2 + 2
const ARC = Math.PI * R            // length of a semicircle

// Left-to-right over the top: start at the 9 o'clock point, sweep clockwise to
// the 3 o'clock point.
const ARC_PATH = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`

function compactMoney(cents: number): string {
  const d = cents / 100
  if (Math.abs(d) >= 1_000_000) return `$${(d / 1_000_000).toFixed(d >= 10_000_000 ? 0 : 1)}M`
  if (Math.abs(d) >= 1_000) return `$${Math.round(d / 1_000)}K`
  return `$${Math.round(d).toLocaleString()}`
}

function monthLabel(iso: string | null): string {
  if (!iso) return 'this month'
  // The server sends the boundary it actually counted from. Parsed as parts,
  // not as a Date: `new Date('2026-08-01')` is UTC midnight and renders as
  // July 31st for anyone west of Greenwich.
  const [y, m] = iso.split('-').map(Number)
  if (!y || !m) return 'this month'
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long' })
}

function pct(now: number, target: number | null): number | null {
  if (target === null) return null
  if (target === 0) return now > 0 ? 100 : 0    // a zero target is met by definition
  return (now / target) * 100
}

export function GoalGauge({ data }: { data: GoalResult }) {
  const { user } = useAuth()
  const [live, setLive] = useState<GoalResult>(data)
  const [editing, setEditing] = useState(false)

  // Adopt a fresh payload from the dashboard run so a reload does not fight a
  // target that was just set here.
  useEffect(() => { setLive(data) }, [data])

  // Only an admin can write a target, and only when a single person is in view
  // — an admin looking at the whole book has nobody to set one FOR.
  const canSet = user?.role === 'admin' && !!live.scope

  async function refresh() {
    setEditing(false)
    try { setLive(await api.myGoal(live.scope ?? undefined)) } catch { /* keep showing what we have */ }
  }

  const wonPct = pct(live.won_value_cents_mtd, live.won_target_cents)
  const callPct = pct(live.calls_this_week, live.call_target)
  const over = wonPct !== null && wonPct >= 100
  // The arc never overshoots its own track; the celebration carries the
  // over-target news instead.
  const sweep = wonPct === null ? 0 : Math.min(100, Math.max(0, wonPct))

  if (editing && live.scope) {
    return (
      <div className="panel goal-panel">
        {/* Same form Settings > Team uses, so "blank clears it" means the same
            thing in both places. */}
        <TargetsForm
          userId={live.scope}
          current={{ monthly_won_value_target_cents: live.won_target_cents,
                     weekly_call_target: live.call_target }}
          onSaved={() => void refresh()}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  // ── The invitation state ──────────────────────────────────────────────────
  if (live.won_target_cents === null && live.call_target === null) {
    return (
      <div className="panel goal-panel">
        <div className="goal-empty">
          <div className="goal-empty-t bebas">No target set</div>
          <div className="goal-empty-s">
            {compactMoney(live.won_value_cents_mtd)} won in {monthLabel(live.month_start)} ·{' '}
            {live.calls_this_week} call{live.calls_this_week === 1 ? '' : 's'} this week.
            {' '}A number to chase makes those mean something.
          </div>
          {canSet ? (
            <button className="plat-btn" onClick={() => setEditing(true)}>Set a target</button>
          ) : live.scope === null ? (
            // An admin viewing the whole book. A quota belongs to a person, so
            // there is nothing to set here — say that rather than telling an
            // admin to go ask an admin.
            <div className="goal-empty-s">
              A target belongs to a person. Pick a rep in the owner filter above
              to see or set theirs.
            </div>
          ) : (
            <div className="goal-empty-s">Ask an admin to set yours.</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`panel goal-panel${over ? ' won' : ''}`}>
      <div className="goal-gauge">
        <svg viewBox={`0 0 ${W} ${H}`} className="goal-svg" role="img"
             aria-label={wonPct === null
               ? `${compactMoney(live.won_value_cents_mtd)} won this month, no target set`
               : `${Math.round(wonPct)} percent of the monthly won-value target`}>
          <path d={ARC_PATH} className="goal-track" strokeWidth={STROKE} fill="none" />
          <path
            d={ARC_PATH}
            className={`goal-arc${over ? ' over' : ''}`}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={ARC}
            strokeDashoffset={ARC - (ARC * sweep) / 100}
          />
        </svg>
        <div className="goal-center">
          <div className="goal-pct bebas">
            {wonPct === null ? '—' : `${Math.round(wonPct)}%`}
          </div>
          <div className="goal-of">
            {compactMoney(live.won_value_cents_mtd)}
            {live.won_target_cents !== null && ` of ${compactMoney(live.won_target_cents)}`}
          </div>
        </div>
      </div>

      <div className="goal-cap">
        {over
          ? `Target cleared — ${monthLabel(live.month_start)} is yours.`
          : `Won in ${monthLabel(live.month_start)}`}
      </div>

      {/* The second, thinner commitment: activity you control today, under the
          outcome you only partly control. */}
      <div className="goal-calls">
        <div className="goal-calls-head">
          <span>Calls this week</span>
          <span className="goal-calls-n">
            {live.calls_this_week}{live.call_target !== null && ` / ${live.call_target}`}
          </span>
        </div>
        {live.call_target === null ? (
          <div className="goal-calls-none">no weekly call target</div>
        ) : (
          <div className="goal-bar">
            <div className={`goal-bar-fill${(callPct ?? 0) >= 100 ? ' over' : ''}`}
                 style={{ width: `${Math.min(100, Math.max(0, callPct ?? 0))}%` }} />
          </div>
        )}
      </div>

      <div className="goal-foot">
        {/* Every widget on this board is a door. */}
        <Link to="/reports?tab=deals" className="linklike">See the deals behind it →</Link>
        {canSet && (
          <button className="linklike" onClick={() => setEditing(true)}>Edit target</button>
        )}
      </div>
    </div>
  )
}
