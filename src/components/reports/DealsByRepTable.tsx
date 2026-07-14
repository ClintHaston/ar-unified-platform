import type { DealsByRepReport } from '../../lib/api'

// WS2a: won/lost/value by rep + month. Honest-empty by design — no closed-won
// history exists yet, so this renders lost-only or an empty state, never
// fabricated wins.

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function DealsByRepTable({ report }: { report: DealsByRepReport }) {
  const { rows, totals } = report
  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="plat-table">
        <thead>
          <tr><th>Rep</th><th>Period</th><th>Won</th><th>Lost</th><th>Won value</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', color: 'var(--p-body)', padding: 18 }}>
                No decided deals in this window. Closed-won history begins at cutover.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={`${r.rep_id}-${r.period}-${i}`}>
                <td><b>{r.rep_name}</b></td>
                <td>{r.period ?? '—'}</td>
                <td className="num">{r.won_count}</td>
                <td className="num">{r.lost_count}</td>
                <td className="num">{r.won_value_cents > 0 ? money(r.won_value_cents) : '—'}</td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 'bold', borderTop: '2px solid var(--p-steel)' }}>
              <td>Total</td><td></td>
              <td className="num">{totals.won_count}</td>
              <td className="num">{totals.lost_count}</td>
              <td className="num">{totals.won_value_cents > 0 ? money(totals.won_value_cents) : '—'}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
