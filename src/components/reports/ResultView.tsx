import type { RunColumn, RunResult } from '../../lib/api'
import { Funnel } from './Funnel'
import { fmt } from './reportFormat'
import {
  DonutChart, GroupedBarChart, LineChartViz, SimpleBarChart, StackedBarChart,
} from './charts/ReportCharts'

// WS2b: render a builder run result. Funnel reuses the WS2a component. Every
// other viz is generic over the engine's {columns, rows}; bar/stacked/grouped/
// line/donut render through recharts (charts/ReportCharts), table and number
// stay native. Money columns (type 'cents') render as dollars.

export function ResultView({ result, accent }: { result: RunResult; accent: string }) {
  if (result.viz === 'funnel') {
    if (result.pipelines.length === 0) return <div className="note">No funnel data.</div>
    return <>{result.pipelines.map((p) => <Funnel key={p.pipeline_id} pipeline={p} accent={accent} />)}</>
  }

  const { columns, rows } = result
  const measures = columns.filter((c) => c.role === 'measure')

  if (rows.length === 0) {
    return <div className="panel"><div className="note">No rows match. Honest-empty by design.</div></div>
  }

  // number: one big figure per measure, no dimension
  if (result.viz === 'number') {
    return (
      <div className="panel" style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        {measures.map((m) => (
          <div key={m.key}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--p-navy-dark)', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(rows[0][m.key], m.type)}
            </div>
            <div className="note">{m.label}</div>
          </div>
        ))}
      </div>
    )
  }

  if (result.viz === 'bar') return <SimpleBarChart columns={columns} rows={rows} accent={accent} />
  if (result.viz === 'stacked_bar') return <StackedBarChart columns={columns} rows={rows} accent={accent} />
  if (result.viz === 'grouped_bar') return <GroupedBarChart columns={columns} rows={rows} accent={accent} />
  if (result.viz === 'line') return <LineChartViz columns={columns} rows={rows} accent={accent} />
  if (result.viz === 'donut') return <DonutChart columns={columns} rows={rows} accent={accent} />

  // table: all columns
  const render = (c: RunColumn, r: Record<string, string | number | null>) => fmt(r[c.key], c.type)
  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="plat-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.role === 'measure' ? 'num' : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
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
