import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type CommissionReport as Report } from '../lib/api'

// Commission report (v1 scope, build step 3c-7): per-rep totals over WON
// deals. Per-deal commission_pct wins; commission_default covers the rest;
// a total missing either renders flagged-incomplete — no invented math.

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function CommissionReport() {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.commissionReport()
      .then((res) => { setReport(res); setError('') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="admin-loading">Loading report…</div>
  if (!report) return <div className="admin-loading">{error || 'Report unavailable'}</div>

  const defaultUnset = report.commission_default_pct === null

  return (
    <div>
      {defaultUnset && (
        <div className="panel" style={{ borderLeft: '4px solid #B4432B' }}>
          <b>Commission % not set.</b>
          <div className="note" style={{ marginTop: 4 }}>
            The company default (<code>commission_default</code>) has never been entered, so deals
            without their own percent are not counted. Totals below are incomplete by design,
            never invented. Set it in <Link to="/admin">Team &amp; settings</Link>.
          </div>
        </div>
      )}
      {!defaultUnset && (
        <div className="note" style={{ marginBottom: 12 }}>
          Company default: <b>{report.commission_default_pct}%</b>, applied to won deals without
          their own percent.
        </div>
      )}

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="plat-table">
          <thead>
            <tr><th>Rep</th><th>Won deals</th><th>Won value</th><th>Commission</th><th>Coverage</th></tr>
          </thead>
          <tbody>
            {report.reps.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--p-body)', padding: 18 }}>
                  No won deals yet. The Sold stage has never held a deal (Amendment 2).
                  Analytics baselines start at cutover.
                </td>
              </tr>
            ) : (
              report.reps.map((r) => (
                <tr key={r.rep_id ?? 'none'}>
                  <td><b>{r.rep_name}</b></td>
                  <td className="num">{r.won_count}</td>
                  <td className="num">{money(r.won_value_cents)}</td>
                  <td className="num">
                    {money(r.commission_cents)}
                    {!r.complete && <span className="pill red" style={{ marginLeft: 8 }}>incomplete</span>}
                  </td>
                  <td className="note">
                    {r.complete
                      ? 'all deals covered'
                      : [
                          r.deals_without_pct > 0 && report.commission_default_pct === null
                            ? `${r.deals_without_pct} deal(s) with no % (default unset)` : null,
                          r.deals_without_value > 0 ? `${r.deals_without_value} deal(s) with no value` : null,
                        ].filter(Boolean).join(' · ')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      <div className="note">
        Won deals only. Per-deal commission % wins; the company default covers deals without one.
      </div>
    </div>
  )
}
