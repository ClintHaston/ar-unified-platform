import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type CompanyRow, type CompanySort, type SortDir } from '../lib/api'

// Companies index (closes the Amendment-35 loose end: Companies used to route
// to the filtered contacts list because no index existed). Server-side
// paginated / searchable / sortable, mirroring the platform_contacts list;
// each row deep-links to the company detail page. Read-only.

const PAGE_SIZE = 50

interface Column { key: string; label: string; sort?: CompanySort }
const COLS: Column[] = [
  { key: 'name', label: 'Name', sort: 'name' },
  { key: 'domain', label: 'Domain', sort: 'domain' },
  { key: 'phone', label: 'Phone' },
  { key: 'location', label: 'Location', sort: 'city' },
  { key: 'contacts', label: 'Contacts', sort: 'contacts' },
  { key: 'open_deals', label: 'Open Deals', sort: 'open_deals' },
  { key: 'created', label: 'Create Date', sort: 'created' },
]

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

export function Companies() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<CompanyRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<CompanySort>('name')
  const [dir, setDir] = useState<SortDir>('asc')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce the search box, resetting to page 1 on a new query.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1) }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q])

  const load = useCallback(() => {
    setLoading(true)
    api.companies({ q: debouncedQ, sort, dir, page, page_size: PAGE_SIZE })
      .then((r) => { setRows(r.companies); setTotal(r.total); setError('') })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load companies'))
      .finally(() => setLoading(false))
  }, [debouncedQ, sort, dir, page])

  useEffect(() => { load() }, [load])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function toggleSort(col: Column) {
    if (!col.sort) return
    if (sort === col.sort) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSort(col.sort); setDir('asc') }
    setPage(1)
  }

  return (
    <div>
      <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input
          className="plat-input"
          style={{ marginBottom: 0, minWidth: 260 }}
          placeholder="Search name, domain, phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="note" style={{ marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} companies`}
        </span>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="plat-table">
            <thead>
              <tr>
                {COLS.map((col) => (
                  <th
                    key={col.key}
                    className={col.sort ? 'th-sort' : undefined}
                    onClick={col.sort ? () => toggleSort(col) : undefined}
                  >
                    {col.label}
                    {col.sort && sort === col.sort && <span className="sort-caret">{dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><button className="linklike" onClick={() => navigate(`/companies/${c.id}`)}><b>{c.name}</b></button></td>
                  <td>{c.domain ?? '—'}</td>
                  <td>{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : '—'}</td>
                  <td>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                  <td>{c.n_contacts.toLocaleString()}</td>
                  <td>{c.n_open_deals.toLocaleString()}</td>
                  <td>{fmtDate(c.created_at)}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={COLS.length} style={{ textAlign: 'center', color: 'var(--p-body)' }}>
                    {debouncedQ ? 'No companies match.' : 'No companies yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="plat-btn ghost" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>← Prev</button>
        <span style={{ fontSize: 12, color: 'var(--p-body)' }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} companies · page ${page} of ${pageCount.toLocaleString()}`}
        </span>
        <button className="plat-btn ghost" disabled={page >= pageCount || loading} onClick={() => setPage((p) => p + 1)}>Next →</button>
      </div>

      {error && <div className="note" style={{ color: '#B4432B', marginTop: 8 }}>{error}</div>}
    </div>
  )
}
