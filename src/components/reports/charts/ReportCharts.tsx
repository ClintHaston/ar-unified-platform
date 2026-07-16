import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { RunColumn } from '../../../lib/api'
import { fmt } from '../reportFormat'
import { AXIS_INK, GRID_INK, LABEL_INK, seriesColors, useReducedMotion } from './palette'
import { pivotSeries } from './pivot'

// recharts-backed chart layer for the WS2b builder. Every chart is theme-anchored
// on the gold (sell) / teal (buy) accent, honours reduced motion, and is fully
// responsive. Bar-family charts render horizontally so long rep lists stay
// legible (the pattern HubSpot/Salesforce use for "by rep" panels).

type Row = Record<string, string | number | null>

interface ChartProps {
  columns: RunColumn[]
  rows: Row[]
  accent: string
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

// ── Simple bar (one category dimension, one or more measures) ──────────────
export function SimpleBarChart({ columns, rows, accent }: ChartProps) {
  const reduced = useReducedMotion()
  const dim = columns.find((c) => c.role === 'dimension')!
  const measures = columns.filter((c) => c.role === 'measure')
  const colors = seriesColors(accent, measures.length)
  const typeByKey = Object.fromEntries(measures.map((m) => [m.key, m.type]))
  const height = barHeight(rows.length, measures.length)

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
                 isAnimationActive={!reduced} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Stacked / grouped bar (category dimension × series × one measure) ──────
function BreakdownBar({ columns, rows, accent, stacked }: ChartProps & { stacked: boolean }) {
  const reduced = useReducedMotion()
  const dim = columns.find((c) => c.role === 'dimension')!
  const series = columns.find((c) => c.role === 'series')!
  const measure = columns.find((c) => c.role === 'measure')!
  const { data, seriesValues } = pivotSeries(rows, dim.key, series.key, measure.key)
  const colors = seriesColors(accent, seriesValues.length)
  const height = barHeight(data.length, stacked ? 1.4 : seriesValues.length)

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
                 radius={stacked ? undefined : [0, 3, 3, 0]} isAnimationActive={!reduced} />
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
export function LineChartViz({ columns, rows, accent }: ChartProps) {
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

  return (
    <div className="panel">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 10, right: 24, bottom: 6, left: 6 }}>
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
function PieFamily({ columns, rows, accent, innerRadius }: ChartProps & { innerRadius: number }) {
  const reduced = useReducedMotion()
  const dim = columns.find((c) => c.role === 'dimension')!
  const measure = columns.find((c) => c.role === 'measure')!
  const data = rows.map((r) => ({ name: String(r[dim.key] ?? '—'), value: Number(r[measure.key] ?? 0) }))
  const colors = seriesColors(accent, data.length)

  return (
    <div className="panel">
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={innerRadius} outerRadius={110}
               paddingAngle={1} isAnimationActive={!reduced}>
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
// One point PER GROUP: x = first measure, y = second, the dimension names the
// point. Per-record scatter would need ungrouped rows, which the report engine
// deliberately does not return.
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
      <div style={{ ...TOOLTIP_STYLE.labelStyle }}>{String(row[dim.key] ?? '—')}</div>
      <div>{mx.label}: {fmt(row[mx.key] as number, mx.type)}</div>
      <div>{my.label}: {fmt(row[my.key] as number, my.type)}</div>
    </div>
  )
}

export function ScatterChartViz({ columns, rows, accent }: ChartProps) {
  const reduced = useReducedMotion()
  const dim = columns.find((c) => c.role === 'dimension')!
  const measures = columns.filter((c) => c.role === 'measure')
  const [mx, my] = measures
  const colors = seriesColors(accent, 1)

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
          <Scatter data={rows} fill={colors[0]} isAnimationActive={!reduced} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
