import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DrillAt, ReportDefinition, RunColumn, RunResult } from '../../lib/api'
import { DrillPopup } from './DrillPopup'
import { Funnel } from './Funnel'
import { fmt } from './reportFormat'
import {
  DonutChart, GroupedBarChart, LineChartViz, PieChartViz, ScatterChartViz,
  SimpleBarChart, StackedBarChart,
} from './charts/ReportCharts'

// WS2b: render a builder run result. Funnel reuses the WS2a component. Every
// other viz is generic over the engine's {columns, rows}; bar/stacked/grouped/
// line/donut/pie/scatter render through recharts (charts/ReportCharts), table
// and number stay native. Money columns (type 'cents') render as dollars.
//
// PHASE 3 DRILL-DOWN: pass `definition` and clicking a datapoint opens the
// records behind it. Without it, everything renders exactly as before — that is
// what keeps a chart usable anywhere a definition is not available (and it is
// why a funnel, which cannot drill honestly, simply never gets a handler).

interface Props {
  result: RunResult
  accent: string
  // The definition that produced THIS result. Omit to render a static chart.
  definition?: ReportDefinition
}

export function ResultView({ result, accent, definition }: Props) {
  const navigate = useNavigate()
  const [drill, setDrill] = useState<{ at: DrillAt; label: string } | null>(null)

  if (result.viz === 'funnel') {
    if (result.pipelines.length === 0) return <div className="note">No funnel data.</div>
    return <>{result.pipelines.map((p) => <Funnel key={p.pipeline_id} pipeline={p} accent={accent} />)}</>
  }

  const { columns, rows } = result
  const measures = columns.filter((c) => c.role === 'measure')

  if (rows.length === 0) {
    return <div className="panel"><div className="note">No rows match. Honest-empty by design.</div></div>
  }

  // A datapoint is only clickable when we know what produced it. The server
  // re-validates regardless; this just avoids offering an affordance that cannot work.
  const onPoint = definition
    ? (at: DrillAt, label: string) => setDrill({ at, label })
    : undefined

  // Per-record scatter: the point IS the record, so go straight there.
  const onRecord = result.route
    ? (id: string) => navigate(result.route!.replace('{id}', id))
    : undefined

  const popup = drill && definition ? (
    <DrillPopup definition={definition} at={drill.at} label={drill.label}
                onClose={() => setDrill(null)} />
  ) : null

  // number (labelled "Metric" in the picker): one big figure per measure, no
  // dimension. The viz KEY stays 'number' so existing saved reports keep running.
  // It has no dimension to click, so its drill is the whole filtered population
  // — which is exactly the set the figure counted.
  if (result.viz === 'number') {
    return (
      <>
        <div className="panel" style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {measures.map((m) => (
            <div key={m.key}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--p-navy-dark)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(rows[0][m.key], m.type)}
              </div>
              <div className="note">{m.label}</div>
            </div>
          ))}
          {onPoint && (
            <button className="plat-btn ghost" style={{ marginLeft: 'auto' }}
                    onClick={() => onPoint({}, 'All matching records')}>
              View records
            </button>
          )}
        </div>
        {popup}
      </>
    )
  }

  let chart: JSX.Element
  if (result.viz === 'bar') chart = <SimpleBarChart columns={columns} rows={rows} accent={accent} onPoint={onPoint} />
  else if (result.viz === 'stacked_bar') chart = <StackedBarChart columns={columns} rows={rows} accent={accent} onPoint={onPoint} />
  else if (result.viz === 'grouped_bar') chart = <GroupedBarChart columns={columns} rows={rows} accent={accent} onPoint={onPoint} />
  else if (result.viz === 'line') chart = <LineChartViz columns={columns} rows={rows} accent={accent} onPoint={onPoint} />
  else if (result.viz === 'donut') chart = <DonutChart columns={columns} rows={rows} accent={accent} onPoint={onPoint} />
  else if (result.viz === 'pie') chart = <PieChartViz columns={columns} rows={rows} accent={accent} onPoint={onPoint} />
  else if (result.viz === 'scatter') chart = <ScatterChartViz columns={columns} rows={rows} accent={accent} onPoint={onPoint} />
  else if (result.viz === 'scatter_records') {
    // Per-record: no drill handler, so a point opens its record instead of a
    // popup that would list that single record back to you.
    chart = (
      <>
        <ScatterChartViz columns={columns} rows={rows} accent={accent} onRecord={onRecord} />
        {result.capped && (
          <div className="note">Showing the first 500 records. Narrow the date range or filters to see the rest.</div>
        )}
      </>
    )
  } else {
    // table: all columns. A row is a group, so clicking it drills that group.
    const dims = columns.filter((c) => c.role === 'dimension' || c.role === 'series')
    const render = (c: RunColumn, r: Record<string, string | number | null>) => fmt(r[c.key], c.type)
    const rowClick = onPoint && dims.length > 0
      ? (r: Record<string, string | number | null>) => {
          const at: DrillAt = {}
          for (const d of dims) at[d.key] = r[d.key] ?? null
          onPoint(at, dims.map((d) => `${d.label}: ${r[d.key] ?? '(none)'}`).join(' · '))
        }
      : undefined
    chart = (
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="plat-table">
          <thead>
            <tr>{columns.map((c) => <th key={c.key} className={c.role === 'measure' ? 'num' : undefined}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} onClick={rowClick ? () => rowClick(r) : undefined}
                  className={rowClick ? 'drillable' : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={c.role === 'measure' ? 'num' : undefined}>{render(c, r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return <>{chart}{popup}</>
}
