import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type DrillAt, type DrillResult, type ReportDefinition } from '../../lib/api'
import { fmt } from './reportFormat'

// Phase 3 drill-down: the records behind a clicked datapoint.
//
// It sends the definition that produced the chart plus `at` (the clicked
// dimension values) and renders whatever the server's detail projection returns.
// Deliberately dumb about content: the columns are named by the server registry,
// so this component never decides what a record IS. It only lays out what came
// back, which is why nothing here can widen what the drill exposes.
//
// DRILL_USERS (2026-08-03): the layout half is now `DrillModal`, exported so the
// funnel stage drill renders through the same table, pager and Open links. Two
// drills that answer with the same SHAPE should not be two layouts that drift
// apart — and the shell is the part with all the fiddly bits (escape to close,
// sticky header, page arithmetic). The FETCH stays with each popup, because a
// shared fetcher prop would have to be memoised by every caller or the load
// effect would refire on every render.

export const PAGE = 25

interface ModalProps {
  // What was clicked, for the heading: "Owner: JP Thurman".
  label: string
  // A second line under the count, where a drill needs to say WHICH population
  // it is showing. The datapoint drill has nothing to add; the stage drill does.
  subtitle?: string
  data: DrillResult | null
  error: string
  loading: boolean
  offset: number
  onOffset: (next: number) => void
  onClose: () => void
}

export function DrillModal({ label, subtitle, data, error, loading, offset,
                             onOffset, onClose }: ModalProps) {
  // Escape closes. The report surfaces are read-only, so there is nothing to
  // lose by closing and no reason to trap the key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const total = data?.total ?? 0
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + PAGE, total)

  return (
    <div className="drill-scrim" onMouseDown={onClose} role="presentation">
      <div className="drill-modal panel" onMouseDown={(e) => e.stopPropagation()}
           role="dialog" aria-modal="true" aria-label={`Records for ${label}`}>
        <div className="drill-head">
          <div>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--p-navy-dark)' }}>{label}</h3>
            <div className="note" style={{ marginTop: 2 }}>
              {loading && !data ? 'Loading records…'
                : `${total.toLocaleString()} ${total === 1 ? 'record' : 'records'}${
                    total > 0 ? ` · showing ${from} to ${to}` : ''}`}
            </div>
            {subtitle && !(loading && !data) && (
              <div className="note drill-sub">{subtitle}</div>
            )}
          </div>
          <button className="plat-btn ghost" onClick={onClose} aria-label="Close">Close</button>
        </div>

        {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}

        {data && data.rows.length === 0 && !error && (
          <div className="note">No records behind this point.</div>
        )}

        {data && data.rows.length > 0 && (
          <div className="drill-tablewrap">
            <table className="plat-table">
              <thead>
                <tr>
                  {data.columns.map((c) => (
                    <th key={c.key} className={c.type === 'cents' ? 'num' : undefined}>{c.label}</th>
                  ))}
                  {data.route && <th aria-label="Open" />}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={String(r._id)}>
                    {data.columns.map((c) => (
                      <td key={c.key} className={c.type === 'cents' ? 'num' : undefined}>
                        {fmt(r[c.key], c.type)}
                      </td>
                    ))}
                    {/* Only where the source HAS a detail page. Activities and
                        offers have none, so they list without a dead link. */}
                    {data.route && (
                      <td className="num">
                        <Link className="drill-open"
                              to={data.route.replace('{id}', String(r._id))}>Open</Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE && (
          <div className="drill-pager">
            <button className="plat-btn ghost" disabled={offset === 0 || loading}
                    onClick={() => onOffset(Math.max(0, offset - PAGE))}>Previous</button>
            <span className="note">{from} to {to} of {total.toLocaleString()}</span>
            <button className="plat-btn ghost" disabled={to >= total || loading}
                    onClick={() => onOffset(offset + PAGE)}>Next</button>
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  definition: ReportDefinition
  at: DrillAt
  label: string
  onClose: () => void
}

export function DrillPopup({ definition, at, label, onClose }: Props) {
  const [data, setData] = useState<DrillResult | null>(null)
  const [error, setError] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback((off: number) => {
    let live = true
    setLoading(true)
    api.drillReport(definition, at, PAGE, off)
      .then((r) => { if (live) { setData(r); setError('') } })
      .catch((e: unknown) => {
        if (live) { setData(null); setError(e instanceof Error ? e.message : 'Could not load these records.') }
      })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [definition, at])

  useEffect(() => load(offset), [load, offset])

  return (
    <DrillModal label={label} data={data} error={error} loading={loading}
                offset={offset} onOffset={setOffset} onClose={onClose} />
  )
}
