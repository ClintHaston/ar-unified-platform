import type { CallActivityReport } from '../../lib/api'
import { CALL_OUTCOME_LABEL } from '../../lib/callOutcomes'

// WS2a: call volume + outcome by rep + month. Sparse until reps log call
// outcomes; calls logged before this workstream count under "no outcome".

export function CallActivityTable({ report }: { report: CallActivityReport }) {
  const { outcomes, rows } = report
  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="plat-table">
        <thead>
          <tr>
            <th>Rep</th><th>Period</th><th>Calls</th>
            {outcomes.map((o) => <th key={o}>{CALL_OUTCOME_LABEL[o]}</th>)}
            <th>No outcome</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={outcomes.length + 4} style={{ textAlign: 'center', color: 'var(--p-body)', padding: 18 }}>
                No calls logged in this window.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={`${r.rep_id}-${r.period}-${i}`}>
                <td><b>{r.rep_name}</b></td>
                <td>{r.period ?? '—'}</td>
                <td className="num"><b>{r.total}</b></td>
                {outcomes.map((o) => (
                  <td key={o} className="num">{r.by_outcome[o] || '—'}</td>
                ))}
                <td className="num">{r.no_outcome || '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
