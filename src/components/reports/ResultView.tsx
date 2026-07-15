import type { RunColumn, RunResult } from '../../lib/api'
import { Funnel } from './Funnel'

// WS2b: render a builder run result. Funnel reuses the WS2a component; bar /
// table / number are generic over the engine's {columns, rows}. Money columns
// (type 'cents') render as dollars.

function fmt(value: string | number | null, type: string): string {
  if (value === null || value === undefined) return '—'
  if (type === 'cents') return `$${(Number(value) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  if (type === 'number') return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (type === 'int') return Number(value).toLocaleString()
  return String(value)
}

export function ResultView({ result, accent }: { result: RunResult; accent: string }) {
  if (result.viz === 'funnel') {
    if (result.pipelines.length === 0) return <div className="note">No funnel data.</div>
    return <>{result.pipelines.map((p) => <Funnel key={p.pipeline_id} pipeline={p} accent={accent} />)}</>
  }

  const { columns, rows } = result
  const dims = columns.filter((c) => c.role === 'dimension')
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

  // bar: one dimension label + first measure as the bar, extra measures as text
  if (result.viz === 'bar') {
    const dim = dims[0]
    const primary = measures[0]
    const max = Math.max(1, ...rows.map((r) => Number(r[primary.key] ?? 0)))
    return (
      <div className="panel">
        <div className="rep-funnel">
          {rows.map((r, i) => (
            <div key={i} className="rep-fstage">
              <div className="rep-fhead">
                <span className="rep-fname">{fmt(r[dim.key], dim.type)}</span>
                <span className="rep-fcount">{fmt(r[primary.key], primary.type)}</span>
              </div>
              <div className="rep-ftrack">
                <div className="rep-fbar" style={{ width: `${(Number(r[primary.key] ?? 0) / max) * 100}%`, background: accent }} />
              </div>
              {measures.length > 1 && (
                <div className="rep-fmeta">
                  {measures.slice(1).map((m) => <span key={m.key}>{m.label}: {fmt(r[m.key], m.type)}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

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
