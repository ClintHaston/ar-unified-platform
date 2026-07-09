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

/** Which map node a job's pulse travels to. Fallback is the job-runner node. */
const JOB_NODE: Record<string, string> = {
  'windsor-ingest': 'windsor',
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, t))))
  return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('')
}

interface FxPulse { key: string; x: number; y: number; ok: boolean; born: number }
interface FxRipple { key: string; node: string; x: number; y: number; kind: 'success' | 'fail'; born: number }

/**
 * Simulation harness, test only. Activated by ?sim=1 in the URL, loudly
 * labeled on screen. Fetches ONE real payload for the true node layout,
 * then replays a scripted sequence entirely in the browser so every
 * animation state (running job, failure, spend heat, cap hit) can be
 * verified without touching the backend or spending a cent. Live mode
 * without the param is untouched and 100% real data.
 */
const SIM = new URLSearchParams(window.location.search).get('sim') === '1'

function simStep(base: SpineHealth, phase: number, tick: number): SpineHealth {
  const d: SpineHealth = JSON.parse(JSON.stringify(base))
  const runs: SpineRun[] = d.recent_runs ? [...d.recent_runs] : []
  const stamp = new Date(Date.now()).toISOString()
  const push = (status: string, cost: number) =>
    runs.unshift({ job_name: 'windsor-ingest', status, cost_usd: cost, detail: 'sim', started_at: stamp + '#' + tick })
  const spend = [0.4, 1.2, 2.75, 4.1, 4.6, 5.0][phase]
  d.spend = { today_usd: spend, cap_usd: 5.0 }
  if (phase === 1 || phase === 2) push('success', 0.35)
  if (phase === 3) push('failed', 0.2)
  if (phase >= 3 && phase <= 4) {
    const w = d.checks.find(c => c.check_name === 'windsor')
    if (w) { w.status = 'red'; w.detail = 'sim: Windsor pull failed, HTTP 500' }
  }
  if (phase === 5) push('paused_cap', 0)
  d.recent_runs = runs.slice(0, 12)
  return d
}

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
  const timer = useRef<number | null>(null)
  const prevRuns = useRef<Set<string> | null>(null)
  const [fx, setFx] = useState<{ pulses: FxPulse[]; ripples: FxRipple[] }>({ pulses: [], ripples: [] })
  const [busyUntil, setBusyUntil] = useState(0)

  useEffect(() => {
    let alive = true
    let simBase: SpineHealth | null = null
    let simTick = 0
    const poll = async () => {
      try {
        if (SIM && simBase) {
          simTick += 1
          setData(simStep(simBase, simTick % 6, simTick))
          setError(null)
          return
        }
        const res = await fetch(`${BASE}/spine/health`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body: SpineHealth = await res.json()
        if (!alive) return
        if (SIM) simBase = body
        setData(body)
        setError(null)
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

  // Motion means something: pulses are born only from REAL new runs seen in
  // the payload, diffed poll over poll. First payload seeds silently so a
  // page load never replays history.
  useEffect(() => {
    if (!data) return
    const now = Date.now()
    const runs = data.recent_runs ?? []
    const keyOf = (r: SpineRun) => r.job_name + '|' + r.started_at
    const keys = new Set(runs.map(keyOf))
    const prune = (f: { pulses: FxPulse[]; ripples: FxRipple[] }) => ({
      pulses: f.pulses.filter(p => now - p.born < 4500),
      ripples: f.ripples.filter(p => now - p.born < 4500),
    })
    if (prevRuns.current === null) { prevRuns.current = keys; return }
    const fresh = runs.filter(r => !prevRuns.current!.has(keyOf(r)))
    prevRuns.current = keys
    if (fresh.length === 0) { setFx(prune); return }
    const laid = layoutNodes(data.checks)
    const find = (name: string) => laid.find(nd => nd.check_name === name)
    const pulses: FxPulse[] = []
    const ripples: FxRipple[] = []
    for (const r of fresh) {
      const target = find(JOB_NODE[r.job_name] ?? 'job-runner') ?? find('job-runner')
      if (!target) continue
      const ok = r.status === 'success'
      pulses.push({ key: keyOf(r), x: target.x, y: target.y, ok, born: now })
      ripples.push({ key: keyOf(r), node: target.check_name, x: target.x, y: target.y,
                     kind: ok ? 'success' : 'fail', born: now })
    }
    setFx(f => { const p = prune(f); return { pulses: [...p.pulses, ...pulses], ripples: [...p.ripples, ...ripples] } })
    setBusyUntil(now + 8000)
  }, [data])

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

  // The board's mood follows spine-governed spend: cool navy near $0,
  // warming as today's total approaches the cap.
  const heat = spendPct
  const boardBg = lerpColor('#1A2B47', '#3B2422', heat * 0.85)
  const wireCold = lerpColor('#2C3E50', '#6B3A2C', heat)
  const busy = Date.now() < busyUntil
  const shuddering = new Set(fx.ripples.filter(r => r.kind === 'fail').map(r => r.node))

  return (
    <div style={{ background: boardBg, transition: 'background 1.6s ease', minHeight: 'calc(100vh - 56px)', color: '#D1D9E6', fontFamily: 'Arial, sans-serif' }}>
      <style>{`
        @keyframes spineBreath { 0%,100% { opacity: .25; } 50% { opacity: .65; } }
        @keyframes spineFlare  { 0%,100% { opacity: .30; } 50% { opacity: .95; } }
        @keyframes spineAngry  { 0%,100% { opacity: .15; transform: scale(1); } 50% { opacity: .75; transform: scale(1.13); } }
        @keyframes spineWarm   { 0% { opacity: .85; } 100% { opacity: 0; } }
        @keyframes spineShudder { 0%,100% { transform: translate(0,0); } 20% { transform: translate(-3px,2px); } 40% { transform: translate(3px,-2px); } 60% { transform: translate(-2px,-2px); } 80% { transform: translate(2px,1px); } }
        @keyframes spineSlideIn { from { transform: translateX(70px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .spine-glow-green { animation: spineBreath 3.2s ease-in-out infinite; }
        .spine-glow-amber { animation: spineBreath 2.2s ease-in-out infinite; }
        .spine-glow-red   { animation: spineFlare 0.9s ease-in-out infinite; }
        .spine-angry      { animation: spineAngry 1.7s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        .spine-wire-warm  { animation: spineWarm 2.6s ease-out forwards; }
        .spine-shudder    { animation: spineShudder 0.45s linear 1.15s 2; }
        .spine-lz         { animation: spineSlideIn 0.6s ease-out; }
      `}</style>

      {SIM && (
        <div style={{
          background: '#C8922A', color: '#1A2B47', fontWeight: 'bold', fontSize: 12,
          textAlign: 'center', padding: '6px 10px', letterSpacing: 1,
        }}>
          SIMULATION MODE, synthetic data for animation testing. Remove ?sim=1 for the live board.
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px 0', flexWrap: 'wrap', gap: 10 }}>
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
              {spendPct >= 1 ? 'CAP HIT, MODEL JOBS PAUSED' : 'SPINE-GOVERNED SPEND'}
            </div>
            <div style={{ fontSize: 9, color: '#5A6B84', marginTop: 1 }}>
              runner jobs only. In-app AI calls are not metered here.
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
        {/* wires: tone warms with spend, red wires stay loudest */}
        {nodes.map(n => (
          <line key={`w-${n.check_name}`} x1={CX} y1={CY} x2={n.x} y2={n.y}
            stroke={n.status === 'red' ? '#E74C3C' : wireCold} strokeWidth={n.status === 'red' ? 1.6 : 1}
            opacity={n.status === 'grey' ? 0.25 : 0.7} />
        ))}

        {/* job light in the wires: born from the core on REAL runs, warm trail
            fades a beat behind, a return bead comes home. */}
        {fx.pulses.map(p => (
          <g key={`fx-${p.key}`}>
            <line x1={CX} y1={CY} x2={p.x} y2={p.y} className="spine-wire-warm"
              stroke={p.ok ? '#2ECC71' : '#E74C3C'} strokeWidth={2.2} />
            <circle r={4.5} fill={p.ok ? '#2ECC71' : '#E74C3C'}>
              <animateMotion dur="1.1s" fill="freeze" path={`M ${CX} ${CY} L ${p.x} ${p.y}`} />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.92;1" dur="1.2s" fill="freeze" />
            </circle>
            <circle r={3} fill={p.ok ? '#2ECC71' : '#C8922A'} opacity={0}>
              <animateMotion dur="1.1s" begin="1.5s" fill="freeze" path={`M ${p.x} ${p.y} L ${CX} ${CY}`} />
              <animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.06;0.92;1" begin="1.5s" dur="1.2s" fill="freeze" />
            </circle>
          </g>
        ))}

        {/* arrival feedback: success ripples once and settles, failure cracks */}
        {fx.ripples.map(rp => rp.kind === 'success' ? (
          <circle key={`rip-${rp.key}`} cx={rp.x} cy={rp.y} r={27} fill="none"
            stroke="#2ECC71" strokeWidth={3} opacity={0}>
            <animate attributeName="r" from="27" to="60" begin="1.15s" dur="1.2s" fill="freeze" />
            <animate attributeName="opacity" values="0;0.9;0" keyTimes="0;0.12;1" begin="1.15s" dur="1.2s" fill="freeze" />
          </circle>
        ) : (
          <g key={`crk-${rp.key}`}>
            <circle cx={rp.x} cy={rp.y} r={27} fill="none" stroke="#E74C3C" strokeWidth={4.5} opacity={0}>
              <animate attributeName="r" from="27" to="72" begin="1.15s" dur="0.5s" fill="freeze" />
              <animate attributeName="opacity" values="0;1;0" keyTimes="0;0.15;1" begin="1.15s" dur="0.55s" fill="freeze" />
            </circle>
            <circle cx={rp.x} cy={rp.y} r={27} fill="none" stroke="#FFFFFF" strokeWidth={1.5} opacity={0}>
              <animate attributeName="r" from="27" to="48" begin="1.3s" dur="0.4s" fill="freeze" />
              <animate attributeName="opacity" values="0;0.9;0" keyTimes="0;0.2;1" begin="1.3s" dur="0.45s" fill="freeze" />
            </circle>
          </g>
        ))}

        {/* the heart: slow beat idle, quick beat when the runner is working */}
        <circle cx={CX} cy={CY} r={46} fill="#2C3E50" stroke="#C8922A" strokeWidth={2.5} />
        <circle cx={CX} cy={CY} r={56} fill="none" stroke="#C8922A" strokeWidth={1.2}
          className="spine-glow-green" style={{ animationDuration: busy ? '1.1s' : '3.6s' }} />
        {busy && (
          <circle cx={CX} cy={CY} r={64} fill="none" stroke="#C8922A" strokeWidth={0.8}
            className="spine-glow-green" style={{ animationDuration: '1.1s', animationDelay: '0.55s' }} />
        )}
        <text x={CX} y={CY - 2} textAnchor="middle" fill="#FFFFFF" fontSize={15} fontWeight="bold">AGENT</text>
        <text x={CX} y={CY + 16} textAnchor="middle" fill="#A8BDD4" fontSize={10}>
          {busy ? 'working' : 'idle'}
        </text>

        {/* app nodes: red carries a persistent angry outer ring plus a shudder
            on the moment of failure; the spend node's pulse speeds with heat */}
        {nodes.map(n => (
          <g key={n.check_name} className={shuddering.has(n.check_name) ? 'spine-shudder' : undefined}>
            {n.status === 'red' && (
              <circle cx={n.x} cy={n.y} r={44} fill="none" stroke="#E74C3C" strokeWidth={2}
                className="spine-angry" />
            )}
            <circle cx={n.x} cy={n.y} r={34} fill="none" stroke={COLORS[n.status]} strokeWidth={7}
              className={`spine-glow-${n.status === 'grey' ? 'amber' : n.status}`}
              style={n.check_name === 'spine-spend'
                ? { animationDuration: `${(3.2 - 2.4 * heat).toFixed(2)}s` } : undefined}
              opacity={n.status === 'grey' ? 0.15 : undefined} />
            <circle cx={n.x} cy={n.y} r={27} fill="#2C3E50" stroke={COLORS[n.status]} strokeWidth={2} />
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

      {/* the river: recent runs as lozenges, newest entering from the right */}
      {(data?.recent_runs?.length ?? 0) > 0 && (
        <div style={{
          borderTop: '1px solid #2C3E50', padding: '9px 24px', display: 'flex', gap: 10,
          flexDirection: 'row-reverse', justifyContent: 'flex-start',
          overflow: 'hidden', whiteSpace: 'nowrap', background: '#182642', alignItems: 'center',
        }}>
          {data!.recent_runs!.map(r => {
            const ok = r.status === 'success'
            const warn = r.status === 'paused_cap' || r.status === 'stopped_budget'
            const c = ok ? '#2ECC71' : warn ? '#C8922A' : '#E74C3C'
            return (
              <span key={r.job_name + '|' + r.started_at} className="spine-lz" style={{
                fontSize: 11.5, color: '#D1D9E6', flexShrink: 0, border: `1px solid ${c}`,
                borderRadius: 999, padding: '4px 12px', background: '#101B30',
              }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: 4,
                  background: c, marginRight: 7, verticalAlign: 'middle',
                }} />
                <b>{r.job_name}</b>{' '}
                <span style={{ color: c }}>${r.cost_usd.toFixed(2)}</span>{' '}
                <span style={{ color: '#A8BDD4' }}>
                  {new Date(r.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {!ok ? ' ' + r.status : ''}
                </span>
              </span>
            )
          })}
          <span style={{ fontSize: 10, color: '#A8BDD4', flexShrink: 0, fontWeight: 'bold', marginLeft: 8 }}>RUNS</span>
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
