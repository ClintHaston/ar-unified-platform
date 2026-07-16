import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { DrillAt, RunColumn } from '../../../lib/api'
import { fmt } from '../reportFormat'
import { AXIS_INK, GRID_INK, LABEL_INK, seriesColors, useReducedMotion } from './palette'
import { pivotSeries } from './pivot'

// recharts-backed chart layer for the WS2b builder. Every chart is theme-anchored
// on the gold (sell) / teal (buy) accent, honours reduced motion, and is fully
// responsive. Bar-family charts render horizontally so long rep lists stay
// legible (the pattern HubSpot/Salesforce use for "by rep" panels).
//
// DRILL-DOWN (Phase 3): a chart emits the clicked datapoint's RAW dimension
// values via onPoint and knows nothing else about drilling. Raw matters: a chart
// displays '-' for a null category, and drilling the string '-' would match
// nothing — so what is emitted is the value the engine grouped on, not the text
// on screen. ResultView decides what to do with it.

type Row = Record<string, string | number | null>

interface ChartProps {
  columns: RunColumn[]
  rows: Row[]
  accent: string
  // Absent = this chart is not drillable, and no click affordance is rendered.
  onPoint?: (at: DrillAt, label: string) => void
}

const TOOLTIP_STYLE = {
  contentStyle: { border: '1px solid #D1D9E6', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 14px rgba(26,43,71,0.12)' },
  labelStyle: { color: LABEL_INK, fontWeight: 700, marginBottom: 2 },
}

const AXIS_TICK = { fontSize: 11, fill: AXIS_INK }

function truncate(v: string): string {
  return v.length > 22 ? `${v.slice(0, 21)}…` : v
}

function barHeight(catCount: number, barsPerCat: number): number {
  return Math.min(820, Math.max(220, catCount * (barsPerCat * 18 + 14) + 64))
}

// recharts hands a clicked element either the datum or a wrapper carrying it.
function rowOf(entry: unknown): Row {
  const e = entry as { payload?: Row } | Row | null
  if (e && typeof e === 'object' && 'payload' in e && e.payload) return e.payload as Row
  return (e ?? {}) as Row
}

function shown(v: string | number | null): string {
  return v === null || v === undefined || v === '' ? '(none)' : String(v)
}

// ── Simple bar (one category dimension, one or more measures) ──────────────
export function SimpleBarChart({ columns, rows, accent, onPoint }: ChartProps) {
  const reduced = useReducedMotion()
  const dim = columns.find((c) => c.role === 'dimension')!
  const measures = columns.filter((c) => c.role === 'measure')
  const colors = seriesColors(accent, measures.length)
  const typeByKey = Object.fromEntries(measures.map((m) => [m.key, m.type]))
  const height = barHeight(rows.length, measures.length)

  const click = onPoint
    ? (entry: unknown) => {
        const r = rowOf(entry)
        onPoint({ [dim.key]: r[dim.key] ?? null }, `${dim.label}: ${shown(r[dim.key])}`)
      }
    : undefined

  return (
    <div className="panel">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} layout="vertical" margin={{ top: 6, right: 28, bottom: 6, left: 6 }}>
          <CartesianGrid horizontal={false} stroke={GRID_INK} />
          <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v) => fmt(v, measures[0].type)} />
          <YAxis type="category" dataKey={dim.key} width={150} tick={AXIS_TICK} tickFormatter={truncate} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(value, name) => [fmt(value as number, typeByKey[name as string] ?? 'int'), name]} />
          {measures.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {measures.map((m, i) => (
            <Bar key={m.key} dataKey={m.key} name={m.label} fill={colors[i]} radius={[0, 3, 3, 0]}
                 isAnimationActive={!reduced} onClick={click}
                 cursor={onPoint ? 'pointer' : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Stacked / grouped bar (category dimension × series × one measure) ──────
function BreakdownBar({ columns, rows, accent, stacked, onPoint }: ChartProps & { stacked: boolean }) {
  const reduced = useReducedMotion()
  const dim = columns.find((c) => c.role === 'dimension')!
  const series = columns.find((c) => c.role === 'series')!
  const measure = columns.find((c) => c.role === 'measure')!
  const { data, seriesValues, rawCategory, rawSeries } = pivotSeries(rows, dim.key, series.key, measure.key)
  const colors = seriesColors(accent, seriesValues.length)
  const height = barHeight(data.length, stacked ? 1.4 : seriesValues.length)

  // A segment identifies BOTH its category and its series value, so the drill
  // carries both. The raw values come from the pivot's maps, not the row keys,
  // which are display strings.
  const click = (sv: string) => (onPoint
    ? (entry: unknown) => {
        const cat = String(rowOf(entry)[dim.key] ?? '-')
        onPoint(
          { [dim.key]: rawCategory[cat] ?? null, [series.key]: rawSeries[sv] ?? null },
          `${dim.label}: ${shown(rawCategory[cat])} · ${series.label}: ${shown(rawSeries[sv])}`,
        )
      }
    : undefined)

  return (
    <div className="panel">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 6, right: 28, bottom: 6, left: 6 }}>
          <CartesianGrid horizontal={false} stroke={GRID_INK} />
          <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v) => fmt(v, measure.type)} />
          <YAxis type="category" dataKey={dim.key} width={150} tick={AXIS_TICK} tickFormatter={truncate} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(value, name) => [fmt(value as number, measure.type), name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {seriesValues.map((sv, i) => (
            <Bar key={sv} dataKey={sv} name={sv} fill={colors[i]} stackId={stacked ? 's' : undefined}
                 radius={stacked ? undefined : [0, 3, 3, 0]} isAnimationActive={!reduced}
                 onClick={click(sv)} cursor={onPoint ? 'pointer' : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function StackedBarChart(props: ChartProps) {
  return <BreakdownBar {...props} stacked />
}

export function GroupedBarChart(props: ChartProps) {
  return <BreakdownBar {...props} stacked={false} />
}

// ── Line (category on x, one line per measure, or per series value) ────────
export function LineChartViz({ columns, rows, accent, onPoint }: ChartProps) {
  const reduced = useReducedMotion()
  const dim = columns.find((c) => c.role === 'dimension')!
  const series = columns.find((c) => c.role === 'series')
  const measures = columns.filter((c) => c.role === 'measure')
  const measureType = measures[0].type

  let data: Row[]
  let lineKeys: string[]
  let colors: string[]
  if (series) {
    const pv = pivotSeries(rows, dim.key, series.key, measures[0].key)
    data = pv.data
    lineKeys = pv.seriesValues
    colors = seriesColors(accent, lineKeys.length)
  } else {
    data = rows
    lineKeys = measures.map((m) => m.key)
    colors = seriesColors(accent, lineKeys.length)
  }
  const nameByKey = series ? {} : Object.fromEntries(measures.map((m) => [m.key, m.label]))

  // A line is drilled at the chart level, which reports the category but not
  // which series line was hit. So a BROKEN-DOWN line is deliberately not
  // drillable: drilling the whole category would return more records than the
  // clicked point represents, and the count would not reconcile. Every other
  // breakdown chart (stacked/grouped bar) identifies its segment and does drill.
  const canDrill = !!onPoint && !series
  const click = canDrill
    ? (state: unknown) => {
        const s = state as { activePayload?: Array<{ payload?: Row }> } | null
        const r = s?.activePayload?.[0]?.payload
        if (!r) return
        onPoint!({ [dim.key]: r[dim.key] ?? null }, `${dim.label}: ${shown(r[dim.key])}`)
      }
    : undefined

  return (
    <div className="panel">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 10, right: 24, bottom: 6, left: 6 }}
                   onClick={click} style={canDrill ? { cursor: 'pointer' } : undefined}>
          <CartesianGrid stroke={GRID_INK} />
          <XAxis dataKey={dim.key} tick={AXIS_TICK} tickFormatter={truncate} />
          <YAxis tick={AXIS_TICK} tickFormatter={(v) => fmt(v, measureType)} width={64} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(value, name) => [fmt(value as number, measureType), name]} />
          {lineKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {lineKeys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} name={(nameByKey as Record<string, string>)[k] ?? k}
                  stroke={colors[i]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={!reduced} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Pie family (one dimension, one measure) ────────────────────────────────
// A pie IS a donut without the hole, so both share one renderer and differ by a
// single radius. Same wrapper pattern as BreakdownBar -> stacked/grouped above.
function PieFamily({ columns, rows, accent, innerRadius, onPoint }: ChartProps & { innerRadius: number }) {
  const reduced = useReducedMotion()
  const dim = columns.find((c) => c.role === 'dimension')!
  const measure = columns.find((c) => c.role === 'measure')!
  // `raw` rides along beside the display name so a slice can drill the value the
  // engine grouped on rather than the '-' shown for a null.
  const data = rows.map((r) => ({
    name: String(r[dim.key] ?? '-'),
    value: Number(r[measure.key] ?? 0),
    raw: r[dim.key] ?? null,
  }))
  const colors = seriesColors(accent, data.length)

  const click = onPoint
    ? (entry: unknown) => {
        const d = rowOf(entry) as unknown as { raw?: string | number | null }
        onPoint({ [dim.key]: d.raw ?? null }, `${dim.label}: ${shown(d.raw ?? null)}`)
      }
    : undefined

  return (
    <div className="panel">
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={innerRadius} outerRadius={110}
               paddingAngle={1} isAnimationActive={!reduced} onClick={click}
               cursor={onPoint ? 'pointer' : undefined}>
            {data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
          </Pie>
          <Tooltip {...TOOLTIP_STYLE} formatter={(value, name) => [fmt(value as number, measure.type), name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DonutChart(props: ChartProps) {
  return <PieFamily {...props} innerRadius={70} />
}

export function PieChartViz(props: ChartProps) {
  return <PieFamily {...props} innerRadius={0} />
}

// ── Scatter (one dimension, exactly two measures) ──────────────────────────
// Two grains, one renderer:
//   * per-GROUP  (viz 'scatter')         — one point per category
//   * per-RECORD (viz 'scatter_records') — one point per record, the label
//     column standing in as the dimension
// The server returns the same {dimension, measure, measure} shape either way,
// which is exactly why per-record scatter needed no new chart.
function ScatterTip({ active, payload, dim, mx, my }: {
  active?: boolean
  payload?: Array<{ payload: Row }>
  dim: RunColumn
  mx: RunColumn
  my: RunColumn
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  return (
    <div style={{ ...TOOLTIP_STYLE.contentStyle, background: '#fff', padding: '6px 9px' }}>
      <div style={{ ...TOOLTIP_STYLE.labelStyle }}>{String(row[dim.key] ?? '-')}</div>
      <div>{mx.label}: {fmt(row[mx.key] as number, mx.type)}</div>
      <div>{my.label}: {fmt(row[my.key] as number, my.type)}</div>
    </div>
  )
}

export function ScatterChartViz({ columns, rows, accent, onPoint, onRecord }: ChartProps & {
  // Per-record mode: a point IS a record, so it opens the record itself rather
  // than a popup listing one row.
  onRecord?: (id: string, label: string) => void
}) {
  const reduced = useReducedMotion()
  const dim = columns.find((c) => c.role === 'dimension')!
  const measures = columns.filter((c) => c.role === 'measure')
  const [mx, my] = measures
  const colors = seriesColors(accent, 1)
  const interactive = !!onPoint || !!onRecord

  const click = interactive
    ? (entry: unknown) => {
        const r = rowOf(entry)
        if (onRecord) {
          if (r._id) onRecord(String(r._id), shown(r[dim.key]))
          return
        }
        onPoint!({ [dim.key]: r[dim.key] ?? null }, `${dim.label}: ${shown(r[dim.key])}`)
      }
    : undefined

  return (
    <div className="panel">
      <ResponsiveContainer width="100%" height={360}>
        <ScatterChart margin={{ top: 12, right: 28, bottom: 26, left: 8 }}>
          <CartesianGrid stroke={GRID_INK} />
          <XAxis type="number" dataKey={mx.key} name={mx.label} tick={AXIS_TICK}
                 tickFormatter={(v) => fmt(v, mx.type)}
                 label={{ value: mx.label, position: 'insideBottom', offset: -14,
                          fill: AXIS_INK, fontSize: 11 }} />
          {/* The axis band must be wide enough for a money tick ($75,000,000)
              AND the rotated label, or they overlap: the default 60px is not. */}
          <YAxis type="number" dataKey={my.key} name={my.label} tick={AXIS_TICK} width={116}
                 tickFormatter={(v) => fmt(v, my.type)}
                 label={{ value: my.label, angle: -90, position: 'insideLeft',
                          fill: AXIS_INK, fontSize: 11, style: { textAnchor: 'middle' } }} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }}
                   content={<ScatterTip dim={dim} mx={mx} my={my} />} />
          <Scatter data={rows} fill={colors[0]} isAnimationActive={!reduced}
                   onClick={click} cursor={interactive ? 'pointer' : undefined} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
