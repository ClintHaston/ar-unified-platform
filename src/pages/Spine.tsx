/**
 * Spine.tsx - The living star map. Read-only view of the agentic OS spine.
 * Polls /spine/health every 5 seconds. Never the source of truth.
 * Layout is a d3-force physics web: stars repel, wires are springs,
 * labels can never overlap. Grab a star and the web resettles.
 */
import { useEffect, useRef, useState } from 'react'
import {
  forceSimulation, forceManyBody, forceLink, forceCollide, forceX, forceY,
} from 'd3-force'
import type { Simulation, SimulationNodeDatum } from 'd3-force'

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
  green: '#3BE38A',
  amber: '#E0A93A',
  red: '#FF5252',
  grey: '#6B7B94',
}

const CX = 600
const CY = 315
const VIEW_W = 1200
const VIEW_H = 640

/** Which map node a job's pulse travels to. Fallback is the job-runner node. */
const JOB_NODE: Record<string, string> = {
  'windsor-ingest': 'windsor',
}

/** Simple line icons, 24x24 stroke paths, keyed by check_name. */
const ICONS: Record<string, string> = {
  'marketing-hub': 'M3 10v4h3l7 5V5l-7 5H3z M17 9a5 5 0 010 6',
  'sales-command': 'M12 4v16 M4 12h16 M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z',
  'lead-intelligence': 'M10 4a6 6 0 100 12 6 6 0 000-12z M14.5 14.5L21 21',
  'inventory-portal': 'M3 8l9-5 9 5v8l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v8',
  'inventory-portal-api': 'M3 8l9-5 9 5v8l-9 5-9-5V8z M8 11.5h8',
  'evaluator': 'M12 3v18 M5 6h14 M5 6l-3 6a3.5 3.5 0 007 0L5 6z M19 6l-3 6a3.5 3.5 0 007 0l-4-6z',
  'unified-platform': 'M4 4h7v7H4V4z M13 4h7v7h-7V4z M4 13h7v7H4v-7z M13 13h7v7h-7v-7z',
  'hubspot-api': 'M12 11a4 4 0 100-8 4 4 0 000 8z M4 21a8 8 0 0116 0',
  'tab-site': 'M4 9l2-5h12l2 5H4z M6 9v11h12V9 M10 20v-6h4v6',
  'tab-api': 'M9 7V3 M15 7V3 M7 7h10v4a5 5 0 01-10 0V7z M12 16v5',
  'windsor': 'M12 3v11 M7 9l5 5 5-5 M4 19h16',
  'spine-db': 'M12 3c-4.4 0-8 1.3-8 3s3.6 3 8 3 8-1.3 8-3-3.6-3-8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  'job-runner': 'M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9L7 7 M17 17l2.1 2.1 M19.1 4.9L17 7 M7 17l-2.1 2.1',
  'unified-api-proxy': 'M3 8h14l-4-4 M21 16H7l4 4',
  'hubspot-sync-data': 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  'scraper-freshness': 'M6 10h12v8H6v-8z M9.5 14h1 M13.5 14h1 M12 10V6 M9 6h6',
}

/** Text glyphs for nodes that read better as a symbol than a drawing. */
const GLYPHS: Record<string, string> = {
  'spine-spend': '$',
}

/** Deterministic starfield, generated once. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const STARFIELD = (() => {
  const rnd = mulberry32(4711)
  return Array.from({ length: 140 }, () => ({
    x: rnd() * VIEW_W, y: rnd() * VIEW_H,
    r: 0.35 + rnd() * 1.0, o: 0.12 + rnd() * 0.45,
  }))
})()

function lerpColor(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, t))))
  return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('')
}

/** Star size follows measured latency: quick internal checks are small dim
    stars, heavy external calls are the big ones. Grey policy nodes stay
    modest and fixed. */
function nodeRadius(c: SpineCheck): number {
  if (c.status === 'grey') return 15
  const l = Math.max(c.latency_ms, 1)
  return Math.round(Math.min(26, Math.max(13, 9 + 5.2 * Math.log10(l + 1))))
}

/** Wrap a label into up to two balanced lines so nothing ever truncates. */
function wrapLabel(label: string): string[] {
  if (label.length <= 14) return [label]
  const mid = label.length / 2
  let best = -1, bestDist = 1e9
  for (let i = 0; i < label.length; i++) {
    if (label[i] === ' ') { const d = Math.abs(i - mid); if (d < bestDist) { bestDist = d; best = i } }
  }
  if (best < 0) return [label]
  return [label.slice(0, best), label.slice(best + 1)]
}

/** Wrap a detail string into up to two short lines. */
function wrapDetail(d: string): string[] {
  if (d.length <= 32) return [d]
  const cut = d.lastIndexOf(' ', 32)
  const p = cut > 8 ? cut : 32
  let b = d.slice(p).trim()
  if (b.length > 34) b = b.slice(0, 33) + '.'
  return [d.slice(0, p), b]
}

interface MapNode extends SimulationNodeDatum {
  id: string
  label: string
  grp: string
  status: CheckStatus
  latency_ms: number
  detail: string
  r: number
  lines: string[]
  detailLines: string[]
  collideR: number
  isCore?: boolean
}

interface MapLink { source: string | MapNode; target: string | MapNode }

/** Seed position on the old group arcs so the settled web still resembles
    the map Clint knows: apps top, integrations lower left, pipelines lower
    right, core near the heart. */
const GROUP_ARCS: Record<string, [number, number, number]> = {
  apps: [-172, -8, 235],
  integrations: [118, 172, 235],
  pipelines: [8, 62, 235],
  core: [78, 102, 135],
}
function seedPosition(grp: string, slot: number, count: number): { x: number; y: number } {
  const [a0, a1, r] = GROUP_ARCS[grp] ?? [70, 110, 235]
  const t = count <= 1 ? 0.5 : slot / (count - 1)
  const deg = a0 + (a1 - a0) * t
  const rad = (deg * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

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

interface FxPulse { key: string; x: number; y: number; ok: boolean; born: number }
interface FxRipple { key: string; node: string; x: number; y: number; kind: 'success' | 'fail'; born: number }

export function Spine() {
  const [data, setData] = useState<SpineHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  const prevRuns = useRef<Set<string> | null>(null)
  const [fx, setFx] = useState<{ pulses: FxPulse[]; ripples: FxRipple[] }>({ pulses: [], ripples: [] })
  const [busyUntil, setBusyUntil] = useState(0)

  const simRef = useRef<Simulation<MapNode, MapLink> | null>(null)
  const nodesRef = useRef<MapNode[]>([])
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<MapNode | null>(null)
  const [, setPhysTick] = useState(0)

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
      simRef.current?.stop()
    }
  }, [])

  // Physics: merge each poll into the living simulation. Node objects are
  // stable by id so positions persist across polls; the sim only reheats
  // when the node set or footprint actually changes, so an idle board does
  // not tick and does not move.
  useEffect(() => {
    if (!data) return
    const prev = new Map(nodesRef.current.map(n => [n.id, n]))
    const next: MapNode[] = []
    const core: MapNode = prev.get('AGENT') ?? {
      id: 'AGENT', label: 'AGENT', grp: 'core', status: 'green', latency_ms: 0,
      detail: '', r: 42, lines: [], detailLines: [], collideR: 74, isCore: true,
      x: CX, y: CY,
    }
    core.fx = CX; core.fy = CY
    next.push(core)
    let changed = false
    const slots: Record<string, number> = {}
    const counts: Record<string, number> = {}
    for (const c of data.checks) counts[c.grp] = (counts[c.grp] ?? 0) + 1
    for (const c of data.checks) {
      const slot = slots[c.grp] ?? 0
      slots[c.grp] = slot + 1
      const r = nodeRadius(c)
      const lines = wrapLabel(c.label)
      const detailLines = c.status !== 'green' ? wrapDetail(c.detail) : []
      const maxChars = Math.max(
        ...lines.map(s => s.length),
        ...(detailLines.length ? detailLines.map(s => s.length * 0.8) : [0]),
      )
      const collideR = Math.max(r + 32, maxChars * 2.9 + 8)
      const ex = prev.get(c.check_name)
      if (ex) {
        if (Math.abs(ex.collideR - collideR) > 5) changed = true
        ex.status = c.status; ex.latency_ms = c.latency_ms; ex.detail = c.detail
        ex.r = r; ex.lines = lines; ex.detailLines = detailLines; ex.collideR = collideR
        next.push(ex)
      } else {
        changed = true
        const p = seedPosition(c.grp, slot, counts[c.grp])
        next.push({
          id: c.check_name, label: c.label, grp: c.grp, status: c.status,
          latency_ms: c.latency_ms, detail: c.detail, r, lines, detailLines,
          collideR, x: p.x + Math.random() * 8, y: p.y + Math.random() * 8,
        })
      }
    }
    if (next.length !== nodesRef.current.length) changed = true
    nodesRef.current = next
    const links: MapLink[] = next.filter(n => !n.isCore).map(n => ({ source: 'AGENT', target: n.id }))
    if (!simRef.current) {
      const s = forceSimulation<MapNode>(next)
        .force('charge', forceManyBody<MapNode>().strength(n => (n.isCore ? -900 : -330)))
        .force('link', forceLink<MapNode, MapLink>(links).id(n => n.id)
          .distance(l => ((l.target as MapNode).grp === 'core' ? 130 : 238)).strength(0.32))
        .force('collide', forceCollide<MapNode>().radius(n => n.collideR).strength(0.95).iterations(2))
        .force('x', forceX<MapNode>(CX).strength(0.05))
        .force('y', forceY<MapNode>(CY + 8).strength(0.075))
        .on('tick', () => {
          for (const n of nodesRef.current) {
            if (n.isCore) continue
            n.x = Math.max(80, Math.min(VIEW_W - 80, n.x ?? CX))
            n.y = Math.max(64, Math.min(VIEW_H - 70, n.y ?? CY))
          }
          setPhysTick(t => t + 1)
        })
      simRef.current = s
    } else {
      const s = simRef.current
      s.nodes(next)
      ;(s.force('link') as ReturnType<typeof forceLink>).links(links as never)
      if (changed) s.alpha(0.5).restart()
    }
  }, [data])

  // Drag: grab a star, the web reheats and follows; release and it settles.
  const toSvgPoint = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current
    if (!svg) return { x: CX, y: CY }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: CX, y: CY }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }
  const onNodeDown = (n: MapNode) => (e: React.PointerEvent) => {
    if (n.isCore) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = n
    const p = toSvgPoint(e)
    n.fx = p.x; n.fy = p.y
    simRef.current?.alphaTarget(0.3).restart()
  }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const n = dragRef.current
      if (!n) return
      const p = toSvgPoint(e)
      n.fx = Math.max(80, Math.min(VIEW_W - 80, p.x))
      n.fy = Math.max(64, Math.min(VIEW_H - 70, p.y))
    }
    const up = () => {
      const n = dragRef.current
      if (!n) return
      n.fx = null; n.fy = null
      dragRef.current = null
      simRef.current?.alphaTarget(0)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
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
    const find = (name: string) => nodesRef.current.find(nd => nd.id === name)
    const pulses: FxPulse[] = []
    const ripples: FxRipple[] = []
    for (const r of fresh) {
      const target = find(JOB_NODE[r.job_name] ?? 'job-runner') ?? find('job-runner')
      if (!target || target.x == null || target.y == null) continue
      const ok = r.status === 'success'
      pulses.push({ key: keyOf(r), x: target.x, y: target.y, ok, born: now })
      ripples.push({ key: keyOf(r), node: target.id, x: target.x, y: target.y,
                     kind: ok ? 'success' : 'fail', born: now })
    }
    setFx(f => { const p = prune(f); return { pulses: [...p.pulses, ...pulses], ripples: [...p.ripples, ...ripples] } })
    setBusyUntil(now + 8000)
  }, [data])

  const nodes = nodesRef.current.filter(n => !n.isCore)
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
  const spendColor = spendPct >= 1 ? '#FF5252' : spendPct >= 0.8 ? '#E0A93A' : '#3BE38A'

  // The board's mood follows spine-governed spend: deep cold space near $0,
  // the whole nebula warming as today's total approaches the cap.
  const heat = spendPct
  const spaceCore = lerpColor('#0B1430', '#3A1712', heat)
  const spaceEdge = lerpColor('#04070F', '#1C0B08', heat)
  const wireCold = lerpColor('#33507A', '#8A4530', heat)
  const busy = Date.now() < busyUntil
  const shuddering = new Set(fx.ripples.filter(r => r.kind === 'fail').map(r => r.node))

  return (
    <div style={{ background: spaceEdge, transition: 'background 1.6s ease', minHeight: 'calc(100vh - 56px)', color: '#D1D9E6', fontFamily: 'Arial, sans-serif' }}>
      <style>{`
        @keyframes spineBreath { 0%,100% { opacity: .25; } 50% { opacity: .65; } }
        @keyframes spineFlare  { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
        @keyframes spineAngry  { 0%,100% { opacity: .2; transform: scale(1); } 50% { opacity: .9; transform: scale(1.16); } }
        @keyframes spineWarm   { 0% { opacity: .9; } 100% { opacity: 0; } }
        @keyframes spineShudder { 0%,100% { transform: translate(0,0); } 20% { transform: translate(-3px,2px); } 40% { transform: translate(3px,-2px); } 60% { transform: translate(-2px,-2px); } 80% { transform: translate(2px,1px); } }
        @keyframes spineSlideIn { from { transform: translateX(70px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .spine-glow-green { animation: spineBreath 3.4s ease-in-out infinite; }
        .spine-glow-amber { animation: spineBreath 2.2s ease-in-out infinite; }
        .spine-glow-red   { animation: spineFlare 0.85s ease-in-out infinite; }
        .spine-angry      { animation: spineAngry 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
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
            {data ? `${nodes.length} checks, refreshed every 5s. Drag a star, the web resettles.` : error ? `map offline: ${error}` : 'connecting...'}
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
            <div style={{ height: 7, background: '#1B2A44', borderRadius: 4, marginTop: 4 }}>
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
              background: (data?.approvals_pending ?? 0) > 0 ? '#C8922A' : '#1B2A44',
              color: (data?.approvals_pending ?? 0) > 0 ? '#1A2B47' : '#A8BDD4',
            }} className={(data?.approvals_pending ?? 0) > 0 ? 'spine-glow-amber' : undefined}
            >{data?.approvals_pending ?? 0}</div>
            <div style={{ fontSize: 10, color: '#A8BDD4', marginTop: 2 }}>APPROVALS</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 22, lineHeight: '44px', fontWeight: 'bold', fontSize: 17,
              background: reds > 0 ? '#FF5252' : '#2ECC71', color: '#1A2B47',
            }}>{reds}</div>
            <div style={{ fontSize: 10, color: '#A8BDD4', marginTop: 2 }}>RED</div>
          </div>
        </div>
      </div>

      {showApprovals && (
        <div style={{
          margin: '12px 24px 0', background: '#0C1526', border: '1px solid #22314D',
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
                    background: a.status === 'pending' ? '#C8922A' : '#22314D',
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
                    background: 'transparent', color: '#FF5252', border: '1px solid #FF5252',
                    borderRadius: 6, padding: '10px 18px', fontWeight: 'bold', fontSize: 13, cursor: 'pointer',
                  }}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <svg ref={svgRef} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{ width: '100%', maxHeight: 'calc(100vh - 230px)', display: 'block' }}>
        <defs>
          <radialGradient id="spineSpace" cx="50%" cy="48%" r="72%">
            <stop offset="0%" stopColor={spaceCore} />
            <stop offset="100%" stopColor={spaceEdge} />
          </radialGradient>
          <filter id="starGlow" x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur stdDeviation="4.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="redBloom" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="7" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* deep space, warming with spend */}
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#spineSpace)"
          style={{ transition: 'fill 1.6s ease' }} />
        {STARFIELD.map((s, i) => (
          <circle key={`bg-${i}`} cx={s.x} cy={s.y} r={s.r} fill="#C9D6EA" opacity={s.o} />
        ))}

        {/* constellation wires: faint, warming with spend, red stays loudest */}
        {nodes.map(n => (
          <line key={`w-${n.id}`} x1={CX} y1={CY} x2={n.x} y2={n.y}
            stroke={n.status === 'red' ? '#FF5252' : wireCold} strokeWidth={n.status === 'red' ? 1.6 : 1}
            opacity={n.status === 'red' ? 0.85 : n.status === 'grey' ? 0.14 : 0.32} />
        ))}

        {/* job light: a shooting streak born from the core on REAL runs, warm
            trail fades a beat behind, a return bead comes home. */}
        {fx.pulses.map(p => (
          <g key={`fx-${p.key}`}>
            <line x1={CX} y1={CY} x2={p.x} y2={p.y} className="spine-wire-warm"
              stroke={p.ok ? '#3BE38A' : '#FF5252'} strokeWidth={2.2} filter="url(#starGlow)" />
            <circle r={5} fill={p.ok ? '#B8FFD9' : '#FFB3B3'} filter="url(#starGlow)">
              <animateMotion dur="1.1s" fill="freeze" path={`M ${CX} ${CY} L ${p.x} ${p.y}`} />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.92;1" dur="1.2s" fill="freeze" />
            </circle>
            <circle r={3} fill={p.ok ? '#3BE38A' : '#E0A93A'} opacity={0} filter="url(#starGlow)">
              <animateMotion dur="1.1s" begin="1.5s" fill="freeze" path={`M ${p.x} ${p.y} L ${CX} ${CY}`} />
              <animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.06;0.92;1" begin="1.5s" dur="1.2s" fill="freeze" />
            </circle>
          </g>
        ))}

        {/* arrival feedback: success ripples once and settles, failure cracks */}
        {fx.ripples.map(rp => rp.kind === 'success' ? (
          <circle key={`rip-${rp.key}`} cx={rp.x} cy={rp.y} r={27} fill="none"
            stroke="#3BE38A" strokeWidth={3} opacity={0} filter="url(#starGlow)">
            <animate attributeName="r" from="27" to="62" begin="1.15s" dur="1.2s" fill="freeze" />
            <animate attributeName="opacity" values="0;0.9;0" keyTimes="0;0.12;1" begin="1.15s" dur="1.2s" fill="freeze" />
          </circle>
        ) : (
          <g key={`crk-${rp.key}`}>
            <circle cx={rp.x} cy={rp.y} r={27} fill="none" stroke="#FF5252" strokeWidth={5} opacity={0} filter="url(#redBloom)">
              <animate attributeName="r" from="27" to="78" begin="1.15s" dur="0.5s" fill="freeze" />
              <animate attributeName="opacity" values="0;1;0" keyTimes="0;0.15;1" begin="1.15s" dur="0.55s" fill="freeze" />
            </circle>
            <circle cx={rp.x} cy={rp.y} r={27} fill="none" stroke="#FFFFFF" strokeWidth={1.5} opacity={0}>
              <animate attributeName="r" from="27" to="50" begin="1.3s" dur="0.4s" fill="freeze" />
              <animate attributeName="opacity" values="0;0.9;0" keyTimes="0;0.2;1" begin="1.3s" dur="0.45s" fill="freeze" />
            </circle>
          </g>
        ))}

        {/* the heart: slow beat idle, quick beat when the runner is working */}
        <circle cx={CX} cy={CY} r={44} fill="#0E1930" stroke="#C8922A" strokeWidth={2.5} filter="url(#starGlow)" />
        <circle cx={CX} cy={CY} r={55} fill="none" stroke="#C8922A" strokeWidth={1.2}
          className="spine-glow-green" style={{ animationDuration: busy ? '1.1s' : '3.8s' }} />
        {busy && (
          <circle cx={CX} cy={CY} r={64} fill="none" stroke="#C8922A" strokeWidth={0.8}
            className="spine-glow-green" style={{ animationDuration: '1.1s', animationDelay: '0.55s' }} />
        )}
        <text x={CX} y={CY - 2} textAnchor="middle" fill="#FFFFFF" fontSize={15} fontWeight="bold">AGENT</text>
        <text x={CX} y={CY + 16} textAnchor="middle" fill="#A8BDD4" fontSize={10}>
          {busy ? 'working' : 'idle'}
        </text>

        {/* the stars: glow halo breathes by status, icon identifies the app,
            size follows latency. Red carries a persistent angry bloom ring
            plus a shudder on the moment of failure. */}
        {nodes.map(n => {
          const x = n.x ?? CX, y = n.y ?? CY
          const c = COLORS[n.status]
          const iconSize = n.r * 1.15
          return (
            <g key={n.id} className={shuddering.has(n.id) ? 'spine-shudder' : undefined}
              onPointerDown={onNodeDown(n)}
              style={{ touchAction: 'none', cursor: 'grab' }}>
              {n.status === 'red' && (
                <circle cx={x} cy={y} r={n.r + 20} fill="none" stroke="#FF5252" strokeWidth={2.5}
                  className="spine-angry" filter="url(#redBloom)" />
              )}
              <circle cx={x} cy={y} r={n.r + 7} fill={c}
                className={`spine-glow-${n.status === 'grey' ? 'amber' : n.status}`}
                style={n.id === 'spine-spend'
                  ? { animationDuration: `${(3.4 - 2.5 * heat).toFixed(2)}s` } : undefined}
                opacity={n.status === 'grey' ? 0.08 : 0.3} filter="url(#starGlow)" />
              <circle cx={x} cy={y} r={n.r} fill="#0E1930" stroke={c}
                strokeWidth={1.6} opacity={n.status === 'grey' ? 0.75 : 1} />
              {ICONS[n.id] ? (
                <g transform={`translate(${x - iconSize / 2}, ${y - iconSize / 2}) scale(${iconSize / 24})`}
                  style={{ pointerEvents: 'none' }}>
                  <path d={ICONS[n.id]} fill="none" stroke={c} strokeWidth={1.9}
                    strokeLinecap="round" strokeLinejoin="round"
                    opacity={n.status === 'grey' ? 0.8 : 1} />
                </g>
              ) : (
                <text x={x} y={y + n.r * 0.36} textAnchor="middle" fill={c} fontSize={n.r * 1.05}
                  fontWeight="bold" style={{ pointerEvents: 'none' }}>
                  {GLYPHS[n.id] ?? n.label.slice(0, 2)}
                </text>
              )}
              {n.lines.map((ln, i) => (
                <text key={i} x={x} y={y + n.r + 14 + i * 11} textAnchor="middle"
                  fill="#C9D6EA" fontSize={10} fontWeight="bold" style={{ pointerEvents: 'none' }}>
                  {ln}
                </text>
              ))}
              <text x={x} y={y + n.r + 14 + n.lines.length * 11} textAnchor="middle"
                fill={c} fontSize={8.5} style={{ pointerEvents: 'none' }}>
                {n.status === 'green' ? `${n.latency_ms}ms` : n.status === 'grey' ? 'OFF BY POLICY / IDLE' : n.status.toUpperCase()}
              </text>
              {n.detailLines.map((dl, i) => (
                <text key={`d-${i}`} x={x} y={y + n.r + 24 + n.lines.length * 11 + i * 10}
                  textAnchor="middle" fill="#A8BDD4" fontSize={8.5} style={{ pointerEvents: 'none' }}>
                  {dl}
                </text>
              ))}
            </g>
          )
        })}
      </svg>

      {/* the river: recent runs as lozenges, newest entering from the right */}
      {(data?.recent_runs?.length ?? 0) > 0 && (
        <div style={{
          borderTop: '1px solid #1B2A44', padding: '9px 24px', display: 'flex', gap: 10,
          flexDirection: 'row-reverse', justifyContent: 'flex-start',
          overflow: 'hidden', whiteSpace: 'nowrap', background: '#070D1A', alignItems: 'center',
        }}>
          {data!.recent_runs!.map(r => {
            const ok = r.status === 'success'
            const warn = r.status === 'paused_cap' || r.status === 'stopped_budget'
            const c = ok ? '#3BE38A' : warn ? '#E0A93A' : '#FF5252'
            return (
              <span key={r.job_name + '|' + r.started_at} className="spine-lz" style={{
                fontSize: 11.5, color: '#D1D9E6', flexShrink: 0, border: `1px solid ${c}`,
                borderRadius: 999, padding: '4px 12px', background: '#0A1120',
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
        borderTop: '1px solid #1B2A44', padding: '10px 24px', display: 'flex', gap: 18,
        overflowX: 'auto', whiteSpace: 'nowrap', background: '#0A1120', minHeight: 56, alignItems: 'center',
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
