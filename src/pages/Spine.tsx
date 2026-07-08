/**
 * Spine.tsx - The living map. Read-only view of the agentic OS spine.
 * Polls /spine/health every 5 seconds. Never the source of truth.
 */
import { useEffect, useRef, useState } from 'react'

const BASE = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:8000')

type CheckStatus = 'green' | 'amber' | 'red' | 'grey'

interface SpineCheck {
  check_name: string
  label: string
  grp: string
  status: CheckStatus
  latency_ms: number
  detail: string
  checked_at: string
}

interface SpineEvent {
  check_name: string
  label: string
  status: CheckStatus
  detail: string
  checked_at: string
}

interface SpineRun {
  job_name: string
  status: string
  cost_usd: number
  detail: string
  started_at: string
}

interface SpineApproval {
  id: number
  title: string
  description: string | null
  action_type: string
  status: string
  created_at: string
  result: string | null
}

interface SpineHealth {
  checks: SpineCheck[]
  activity: SpineEvent[]
  approvals_pending: number
  spend?: { today_usd: number; cap_usd: number }
  recent_runs?: SpineRun[]
}

const COLORS: Record<CheckStatus, string> = {
  green: '#2ECC71',
  amber: '#C8922A',
  red: '#E74C3C',
  grey: '#5A6B84',
}

const CX = 600
const CY = 310
const RADIUS = 235

/** Assign each check a fixed angle slot by group so the layout is stable. */
function layoutNodes(checks: SpineCheck[]) {
  const groups: Record<string, SpineCheck[]> = {}
  for (const c of checks) {
    if (!groups[c.grp]) groups[c.grp] = []
    groups[c.grp].push(c)
  }
  for (const g of Object.values(groups)) g.sort((a, b) => a.check_name.localeCompare(b.check_name))

  // degree ranges per group: 0 = right, -90 = straight up, +90 = straight down
  const ranges: Record<string, [number, number]> = {
    apps: [-172, -8],          // arc across the top
    integrations: [118, 172],  // lower left
    pipelines: [8, 62],        // lower right
    core: [88, 92],            // straight down, close in
  }

  const placed: Array<SpineCheck & { x: number; y: number }> = []
  for (const [grp, list] of Object.entries(groups)) {
    const [a0, a1] = ranges[grp] ?? [70, 110]
    const r = grp === 'core' ? 130 : RADIUS
    list.forEach((c, i) => {
      const t = list.length === 1 ? 0.5 : i / (list.length - 1)
      const deg = a0 + (a1 - a0) * t
      const rad = (deg * Math.PI) / 180
      placed.push({ ...c, x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) })
    })
  }
  return placed
}

export function Spine() {
  const [data, setData] = useState<SpineHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pulseKey, setPulseKey] = useState(0)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const res = await fetch(`${BASE}/spine/health`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body: SpineHealth = await res.json()
        if (!alive) return
        setData(body)
        setError(null)
        setPulseKey(k => k + 1)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'fetch failed')
      }
    }
    poll()
    timer.current = window.setInterval(poll, 5000)
    return () => {
      alive = false
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [])

  const nodes = data ? layoutNodes(data.checks) : []
  const reds = nodes.filter(n => n.status === 'red').length

  const [showApprovals, setShowApprovals] = useState(false)
  const [approvals, setApprovals] = useState<SpineApproval[]>([])
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const authHeaders = (): Record<string, string> => {
    const t = localStorage.getItem('ar_token')
    return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : {}
  }

  const loadApprovals = async () => {
    try {
      const r = await fetch(`${BASE}/spine/approvals`, { headers: authHeaders() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setApprovals(((await r.json()) as { approvals: SpineApproval[] }).approvals)
    } catch (e) {
      setActionMsg('Could not load approvals: ' + (e instanceof Error ? e.message : 'error'))
    }
  }

  const decide = async (id: number, verb: 'approve' | 'reject') => {
    setActionMsg(null)
    try {
      const r = await fetch(`${BASE}/spine/approvals/${id}/${verb}`, {
        method: 'POST', headers: authHeaders(),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.detail ?? `HTTP ${r.status}`)
      setActionMsg(`#${id} ${verb}d: ${body.result}`)
      await loadApprovals()
    } catch (e) {
      setActionMsg(`#${id} ${verb} failed: ` + (e instanceof Error ? e.message : 'error'))
    }
  }

  const spend = data?.spend
  const spendPct = spend && spend.cap_usd > 0 ? Math.min(spend.today_usd / spend.cap_usd, 1) : 0
  const spendColor = spendPct >= 1 ? '#E74C3C' : spendPct >= 0.8 ? '#C8922A' : '#2ECC71'

  return (
    <div style={{ background: '#1A2B47', minHeight: 'calc(100vh - 56px)', color: '#D1D9E6', fontFamily: 'Arial, sans-serif' }}>
      <style>{`
        @keyframes spineBreath { 0%,100% { opacity: .25; } 50% { opacity: .65; } }
        @keyframes spineFlare  { 0%,100% { opacity: .30; } 50% { opacity: .95; } }
        .spine-glow-green { animation: spineBreath 3.2s ease-in-out infinite; }
        .spine-glow-amber { animation: spineBreath 2.2s ease-in-out infinite; }
        .spine-glow-red   { animation: spineFlare 0.9s ease-in-out infinite; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px 0' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' }}>Asset Resource Spine</div>
          <div style={{ fontSize: 12, color: '#A8BDD4' }}>
            {data ? `${nodes.length} checks, refreshed every 5s` : error ? `map offline: ${error}` : 'connecting...'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ minWidth: 190, textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 'bold', color: spendColor }}>
              ${(spend?.today_usd ?? 0).toFixed(2)}
              <span style={{ color: '#A8BDD4', fontWeight: 'normal', fontSize: 13 }}>
                {' '}of ${(spend?.cap_usd ?? 0).toFixed(2)} today
              </span>
            </div>
            <div style={{ height: 7, background: '#2C3E50', borderRadius: 4, marginTop: 4 }}>
              <div style={{
                height: 7, borderRadius: 4, width: `${Math.max(spendPct * 100, 2)}%`,
                background: spendColor,
              }} className={spendPct >= 1 ? 'spine-glow-red' : undefined} />
            </div>
            <div style={{ fontSize: 10, color: '#A8BDD4', marginTop: 2 }}>
              {spendPct >= 1 ? 'CAP HIT, MODEL JOBS PAUSED' : 'DAILY SPEND'}
            </div>
          </div>
          <div style={{ textAlign: 'center', cursor: 'pointer' }}
            onClick={() => { setShowApprovals(s => !s); if (!showApprovals) loadApprovals() }}>
            <div style={{
              width: 44, height: 44, borderRadius: 22, lineHeight: '44px', fontWeight: 'bold', fontSize: 17,
              background: (data?.approvals_pending ?? 0) > 0 ? '#C8922A' : '#2C3E50',
              color: (data?.approvals_pending ?? 0) > 0 ? '#1A2B47' : '#A8BDD4',
            }} className={(data?.approvals_pending ?? 0) > 0 ? 'spine-glow-amber' : undefined}
            >{data?.approvals_pending ?? 0}</div>
            <div style={{ fontSize: 10, color: '#A8BDD4', marginTop: 2 }}>APPROVALS</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 22, lineHeight: '44px', fontWeight: 'bold', fontSize: 17,
              background: reds > 0 ? '#E74C3C' : '#2ECC71', color: '#1A2B47',
            }}>{reds}</div>
            <div style={{ fontSize: 10, color: '#A8BDD4', marginTop: 2 }}>RED</div>
          </div>
        </div>
      </div>

      {showApprovals && (
        <div style={{
          margin: '12px 24px 0', background: '#16233B', border: '1px solid #2C3E50',
          borderRadius: 8, padding: '12px 16px',
        }}>
          <div style={{ fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 }}>
            Approval queue
          </div>
          {actionMsg && <div style={{ fontSize: 12, color: '#C8922A', marginBottom: 8 }}>{actionMsg}</div>}
          {approvals.length === 0 && <div style={{ fontSize: 12, color: '#A8BDD4' }}>Nothing here.</div>}
          {approvals.map(a => (
            <div key={a.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              padding: '10px 0', borderTop: '1px solid #22314D', flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 13, color: '#FFFFFF' }}>
                  #{a.id} {a.title}
                  <span style={{
                    marginLeft: 8, fontSize: 10, padding: '2px 7px', borderRadius: 9,
                    background: a.status === 'pending' ? '#C8922A' : '#2C3E50',
                    color: a.status === 'pending' ? '#1A2B47' : '#A8BDD4',
                  }}>{a.status.toUpperCase()}</span>
                </div>
                {a.description && <div style={{ fontSize: 11.5, color: '#A8BDD4', marginTop: 3 }}>{a.description}</div>}
                {a.result && <div style={{ fontSize: 11, color: '#2ECC71', marginTop: 3 }}>{a.result}</div>}
              </div>
              {a.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => decide(a.id, 'approve')} style={{
                    background: '#2ECC71', color: '#1A2B47', border: 'none', borderRadius: 6,
                    padding: '10px 18px', fontWeight: 'bold', fontSize: 13, cursor: 'pointer',
                  }}>Approve</button>
                  <button onClick={() => decide(a.id, 'reject')} style={{
                    background: 'transparent', color: '#E74C3C', border: '1px solid #E74C3C',
                    borderRadius: 6, padding: '10px 18px', fontWeight: 'bold', fontSize: 13, cursor: 'pointer',
                  }}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <svg viewBox="0 0 1200 620" style={{ width: '100%', maxHeight: 'calc(100vh - 220px)', display: 'block' }}>
        {/* wires */}
        {nodes.map(n => (
          <line key={`w-${n.check_name}`} x1={CX} y1={CY} x2={n.x} y2={n.y}
            stroke={n.status === 'red' ? '#E74C3C' : '#2C3E50'} strokeWidth={n.status === 'red' ? 1.6 : 1}
            opacity={n.status === 'grey' ? 0.25 : 0.7} />
        ))}

        {/* job pulses: one bead per healthy wire per refresh */}
        {nodes.filter(n => n.status === 'green' || n.status === 'amber').map(n => (
          <circle key={`p-${n.check_name}-${pulseKey}`} r={3.5} fill={COLORS[n.status]}>
            <animateMotion dur="1.6s" fill="freeze" path={`M ${CX} ${CY} L ${n.x} ${n.y}`} />
            <animate attributeName="opacity" values="0.9;0.9;0" dur="1.6s" fill="freeze" />
          </circle>
        ))}

        {/* central agent node */}
        <circle cx={CX} cy={CY} r={46} fill="#2C3E50" stroke="#C8922A" strokeWidth={2.5} />
        <circle cx={CX} cy={CY} r={56} fill="none" stroke="#C8922A" strokeWidth={1}
          className="spine-glow-green" />
        <text x={CX} y={CY - 2} textAnchor="middle" fill="#FFFFFF" fontSize={15} fontWeight="bold">AGENT</text>
        <text x={CX} y={CY + 16} textAnchor="middle" fill="#A8BDD4" fontSize={10}>read-only spine</text>

        {/* app nodes */}
        {nodes.map(n => (
          <g key={n.check_name}>
            <circle cx={n.x} cy={n.y} r={34} fill="none" stroke={COLORS[n.status]} strokeWidth={7}
              className={`spine-glow-${n.status === 'grey' ? 'amber' : n.status}`}
              opacity={n.status === 'grey' ? 0.15 : undefined} />
            <circle cx={n.x} cy={n.y} r={27} fill="#2C3E50" stroke={COLORS[n.status]} strokeWidth={2} />
            <circle cx={n.x} cy={n.y - 34} r={0} />
            <text x={n.x} y={n.y + 3} textAnchor="middle" fill="#FFFFFF" fontSize={9.5} fontWeight="bold">
              {n.label.length > 14 ? n.label.slice(0, 13) + '.' : n.label}
            </text>
            <text x={n.x} y={n.y + 46} textAnchor="middle" fill={COLORS[n.status]} fontSize={9}>
              {n.status === 'green' ? `${n.latency_ms}ms` : n.status.toUpperCase()}
            </text>
            {(n.status === 'red' || n.status === 'amber' || n.status === 'grey') && (
              <text x={n.x} y={n.y + 59} textAnchor="middle" fill="#A8BDD4" fontSize={8.5}>
                {n.detail.length > 42 ? n.detail.slice(0, 41) + '.' : n.detail}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* recent job runs */}
      {(data?.recent_runs?.length ?? 0) > 0 && (
        <div style={{
          borderTop: '1px solid #2C3E50', padding: '8px 24px', display: 'flex', gap: 18,
          overflowX: 'auto', whiteSpace: 'nowrap', background: '#182642', alignItems: 'center',
        }}>
          <span style={{ fontSize: 10, color: '#A8BDD4', flexShrink: 0, fontWeight: 'bold' }}>RUNS</span>
          {data!.recent_runs!.map((r, i) => (
            <span key={i} style={{ fontSize: 11.5, color: '#D1D9E6', flexShrink: 0 }}>
              <span style={{
                display: 'inline-block', width: 9, height: 9, borderRadius: 5, marginRight: 6,
                verticalAlign: 'middle',
                background: r.status === 'success' ? '#2ECC71'
                  : r.status === 'paused_cap' || r.status === 'stopped_budget' ? '#C8922A' : '#E74C3C',
              }} />
              <b>{r.job_name}</b>{' '}
              <span style={{ color: '#A8BDD4' }}>
                {new Date(r.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>{' '}
              ${r.cost_usd.toFixed(2)} {r.status !== 'success' ? r.status : ''}
            </span>
          ))}
        </div>
      )}

      {/* heartbeat strip */}
      <div style={{
        borderTop: '1px solid #2C3E50', padding: '10px 24px', display: 'flex', gap: 18,
        overflowX: 'auto', whiteSpace: 'nowrap', background: '#16233B', minHeight: 56, alignItems: 'center',
      }}>
        {data && data.activity.length === 0 && (
          <span style={{ fontSize: 12, color: '#A8BDD4' }}>No degraded events in the last 14 days.</span>
        )}
        {data?.activity.map((e, i) => (
          <span key={i} style={{ fontSize: 11.5, color: '#D1D9E6', flexShrink: 0 }}>
            <span style={{
              display: 'inline-block', width: 9, height: 9, borderRadius: 5,
              background: COLORS[e.status], marginRight: 6, verticalAlign: 'middle',
            }} />
            <b>{e.label}</b>{' '}
            <span style={{ color: '#A8BDD4' }}>
              {new Date(e.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>{' '}
            {e.detail.length > 52 ? e.detail.slice(0, 51) + '.' : e.detail}
          </span>
        ))}
      </div>
    </div>
  )
}
