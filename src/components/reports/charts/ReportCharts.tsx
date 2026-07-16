import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { ComboConfig, DrillAt, GaugeConfig, RunColumn } from '../../../lib/api'
import { fmt } from '../reportFormat'
import {
  AXIS_INK, GRID_INK, LABEL_INK, seriesColors, toneHex, useReducedMotion,
} from './palette'
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

// ── Combo (one dimension, >=2 measures, each a bar or line on left/right) ──
// The engine already emits one column per measure, so this needed no new query
// shape: it is the same {dimension, measure, measure, ...} rows every bar chart
// gets, rendered through a ComposedChart instead.
//
// A money axis needs a wider band than the recharts default 60px or the ticks
// collide with the label — the same fix the scatter Y axis carries.
const MONEY_AXIS_W = 116
const PLAIN_AXIS_W = 64

function axisWidth(types: string[]): number {
  return types.includes('cents') ? MONEY_AXIS_W : PLAIN_AXIS_W
}

export function ComboChart({ columns, rows, accent, combo, onPoint }: ChartProps & {
  combo: ComboConfig
}) {
  const reduced = useReducedMotion()
  const dim = columns.find((c) => c.role === 'dimension')!
  const measures = columns.filter((c) => c.role === 'measure')
  const colors = seriesColors(accent, measures.length)
  const typeByKey = Object.fromEntries(measures.map((m) => [m.key, m.type]))

  // `combo` is the server's NORMALISED spec, so every measure has an entry; the
  // fallback is belt-and-braces for a panel rendered from an older saved result.
  const specOf = (k: string) => combo?.[k] ?? { as: 'bar' as const, axis: 'left' as const }
  const onAxis = (side: 'left' | 'right') => measures.filter((m) => specOf(m.key).axis === side)
  const leftM = onAxis('left')
  const rightM = onAxis('right')

  const click = onPoint
    ? (entry: unknown) => {
        const r = rowOf(entry)
        onPoint({ [dim.key]: r[dim.key] ?? null }, `${dim.label}: ${shown(r[dim.key])}`)
      }
    : undefined

  return (
    <div className="panel">
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={rows} margin={{ top: 12, right: 16, bottom: 6, left: 6 }}>
          <CartesianGrid stroke={GRID_INK} />
          <XAxis dataKey={dim.key} tick={AXIS_TICK} tickFormatter={truncate} />
          <YAxis yAxisId="left" tick={AXIS_TICK} width={axisWidth(leftM.map((m) => m.type))}
                 tickFormatter={(v) => fmt(v, leftM[0]?.type ?? 'int')} />
          {/* The right axis only exists if a measure asked for it, so a
              single-axis combo does not render an empty band. */}
          {rightM.length > 0 && (
            <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK}
                   width={axisWidth(rightM.map((m) => m.type))}
                   tickFormatter={(v) => fmt(v, rightM[0].type)} />
          )}
          <Tooltip {...TOOLTIP_STYLE}
                   formatter={(value, name) => [fmt(value as number, typeByKey[name as string] ?? 'int'), name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {measures.map((m, i) => {
            const spec = specOf(m.key)
            // A measure on the right axis when no right axis exists would throw;
            // normalisation makes that unreachable, but fall back to left anyway.
            const yAxisId = spec.axis === 'right' && rightM.length > 0 ? 'right' : 'left'
            return spec.as === 'line' ? (
              <Line key={m.key} yAxisId={yAxisId} type="monotone" dataKey={m.key} name={m.label}
                    stroke={colors[i]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={!reduced} />
            ) : (
              <Bar key={m.key} yAxisId={yAxisId} dataKey={m.key} name={m.label} fill={colors[i]}
                   radius={[3, 3, 0, 0]} isAnimationActive={!reduced}
                   onClick={click} cursor={onPoint ? 'pointer' : undefined} />
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Gauge (one measure, no dimension, against a banded scale) ──────────────
// The value arc is drawn over a full-circumference track split into the
// configured bands, so the bands READ as a scale rather than as decoration. The
// tone -> hex map is the frontend's; the server only ever sends the enum.
// `accent` is intentionally unused: a gauge's colour comes from its band tone,
// not the source accent, so a "bad" band reads red on a sell report too.
export function GaugeChart({ columns, rows, gauge }: ChartProps & {
  gauge: GaugeConfig
}) {
  const reduced = useReducedMotion()
  const measure = columns.find((c) => c.role === 'measure')!
  const raw = Number(rows[0]?.[measure.key] ?? 0)
  const { min, max, bands } = gauge
  const span = max - min || 1
  // Clamp for the ARC only: an out-of-range value must not draw past the track.
  // The printed figure below stays the real number, so the gauge never lies.
  const clamped = Math.min(Math.max(raw, min), max)
  const pct = ((clamped - min) / span) * 100

  // Which band the value lands in decides the arc's tone.
  const band = bands.find((b) => clamped <= b.to) ?? bands[bands.length - 1]
  const arc = toneHex(band?.tone ?? 'neutral')
  const outOfRange = raw < min || raw > max

  return (
    <div className="panel" style={{ position: 'relative' }}>
      {/* The band scale, as a plain proportional strip under the dial. */}
      <ResponsiveContainer width="100%" height={210}>
        <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ value: pct }]}
                        startAngle={210} endAngle={-30}>
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: GRID_INK }} dataKey="value" cornerRadius={6}
                     fill={arc} isAnimationActive={!reduced} angleAxisId={0} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div style={{ textAlign: 'center', marginTop: -74, paddingBottom: 18 }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: LABEL_INK, fontVariantNumeric: 'tabular-nums' }}>
          {fmt(raw, measure.type)}
        </div>
        <div className="note" style={{ marginTop: 2 }}>{measure.label}</div>
        {outOfRange && (
          <div className="note" style={{ color: '#B4432B', marginTop: 2 }}>
            Outside the {fmt(min, measure.type)} to {fmt(max, measure.type)} scale.
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
        {bands.map((b, i) => {
          const from = i === 0 ? min : bands[i - 1].to
          return (
            <div key={i} style={{ flex: Math.max(b.to - from, 0.0001), minWidth: 2 }} title={`up to ${b.to}`}>
              <div style={{ height: 6, borderRadius: 3, background: toneHex(b.tone) }} />
              <div className="note" style={{ fontSize: 10, textAlign: 'right' }}>{fmt(b.to, measure.type)}</div>
            </div>
          )
        })}
      </div>
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
