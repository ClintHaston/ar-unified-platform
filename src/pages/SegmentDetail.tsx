import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type CompanyMemberRow, type ContactRow, type ContactSort, type OwnerOption, type SearchResult, type SegmentCriteria, type SegmentDetailResponse, type SegmentSource, type SortDir } from '../lib/api'
import { SegmentCriteriaBuilder } from '../components/SegmentCriteriaBuilder'
import { useBreadcrumbTitle } from '../components/shell/BreadcrumbTitle'
import { TYPE_LABEL, fmtDate } from './Contacts'

const PAGE_SIZE = 50

interface Column { key: string; label: string; sort?: ContactSort }
const CONTACT_COLS: Column[] = [
  { key: 'name', label: 'Name', sort: 'name' },
  { key: 'email', label: 'Email', sort: 'email' },
  { key: 'phone', label: 'Phone' },
  { key: 'type', label: 'Type', sort: 'type' },
  { key: 'lead_status', label: 'Lead Status', sort: 'lead_status' },
  { key: 'company', label: 'Primary Company', sort: 'company' },
  { key: 'owner', label: 'Contact Owner', sort: 'owner' },
  { key: 'last_activity', label: 'Last Activity', sort: 'last_activity' },
  { key: 'created', label: 'Create Date', sort: 'created' },
]

export function SegmentDetail() {
  const { segmentId } = useParams<{ segmentId: string }>()
  const navigate = useNavigate()

  const [seg, setSeg] = useState<SegmentDetailResponse | null>(null)
  const [members, setMembers] = useState<Array<ContactRow | CompanyMemberRow>>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<ContactSort>('name')
  const [dir, setDir] = useState<SortDir>('asc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  const [editingCriteria, setEditingCriteria] = useState(false)
  const [draftCriteria, setDraftCriteria] = useState<SegmentCriteria>({ groups: [] })
  const [savingCriteria, setSavingCriteria] = useState(false)
  const [sources, setSources] = useState<SegmentSource[]>([])
  const [owners, setOwners] = useState<OwnerOption[]>([])

  const loadSeg = useCallback(() => {
    if (!segmentId) return
    api.getSegment(segmentId)
      .then((r) => { setSeg(r); setDraftCriteria(r.criteria); setError('') })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load list'))
  }, [segmentId])

  const loadMembers = useCallback(() => {
    if (!segmentId) return
    setLoading(true)
    api.segmentMembers(segmentId, { sort, dir, page, page_size: PAGE_SIZE })
      .then((r) => { setMembers(r.members); setTotal(r.total) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load members'))
      .finally(() => setLoading(false))
  }, [segmentId, sort, dir, page])

  useEffect(() => { loadSeg() }, [loadSeg])
  useEffect(() => { loadMembers() }, [loadMembers])

  // Show the list/segment name in the breadcrumb once it loads.
  useBreadcrumbTitle(seg?.name)
  useEffect(() => {
    api.segmentRegistry().then((r) => setSources(r.sources)).catch(() => setSources([]))
    api.contactOwners().then((r) => setOwners(r.owners)).catch(() => setOwners([]))
  }, [])

  const isContact = seg?.object_type === 'contact'
  const source = sources.find((s) => s.object_type === seg?.object_type)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function toggleSort(col: Column) {
    if (!col.sort) return
    if (sort === col.sort) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSort(col.sort); setDir('asc') }
    setPage(1)
  }

  async function saveCriteria() {
    if (!segmentId) return
    setSavingCriteria(true)
    try {
      await api.updateSegment(segmentId, { criteria: draftCriteria })
      setEditingCriteria(false)
      loadSeg(); setPage(1); loadMembers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save criteria')
    } finally {
      setSavingCriteria(false)
    }
  }

  async function removeMember(recordId: string) {
    if (!segmentId) return
    try {
      await api.removeSegmentMember(segmentId, recordId)
      loadSeg(); loadMembers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member')
    }
  }

  async function addMember(recordId: string) {
    if (!segmentId) return
    try {
      await api.addSegmentMembers(segmentId, [recordId])
      loadSeg(); loadMembers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add member')
    }
  }

  async function archive() {
    if (!segmentId || !confirm('Archive this list? Members are not deleted.')) return
    try {
      await api.archiveSegment(segmentId)
      navigate('/lists')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to archive')
    }
  }

  async function exportCsv() {
    if (!segmentId || !seg) return
    setExporting(true)
    try {
      const rows: Array<ContactRow | CompanyMemberRow> = []
      let p = 1
      for (;;) {
        const r = await api.segmentMembers(segmentId, { sort, dir, page: p, page_size: 100 })
        rows.push(...r.members)
        if (rows.length >= r.total || r.members.length === 0) break
        p += 1
      }
      const header = isContact
        ? ['Name', 'Email', 'Phone', 'Type', 'Lead Status', 'Primary Company', 'Contact Owner', 'Last Activity Date', 'Create Date']
        : ['Name', 'Domain', 'City', 'State', 'Create Date']
      const lines = [header.join(',')]
      for (const m of rows) {
        const cells = isContact
          ? (() => { const c = m as ContactRow; return [c.name ?? '', c.email ?? '', c.phone ?? '', c.contact_type, c.sales_lead_status ?? '', c.company_name ?? '', c.owner_name ?? '', c.last_activity_at ?? '', c.created_at] })()
          : (() => { const co = m as CompanyMemberRow; return [co.name, co.domain ?? '', co.city ?? '', co.state ?? '', co.created_at] })()
        lines.push(cells.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${seg.name.replace(/[^a-z0-9]+/gi, '-')}.csv`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  if (!seg) return <div className="admin-loading">{error || 'Loading list…'}</div>

  return (
    <div>
      <Link to="/lists" className="back-link">← Back to lists</Link>

      <div className="panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>{seg.name}</h3>
          <span className={`pill ${seg.type === 'active' ? 'buy' : 'gold'}`}>{seg.type === 'active' ? 'Active' : 'Static'}</span>
          <span className="note" style={{ textTransform: 'capitalize' }}>{seg.object_type}s · {seg.count.toLocaleString()} members · owner {seg.owner_name ?? '—'}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className="plat-btn ghost" onClick={exportCsv} disabled={exporting || total === 0}>{exporting ? 'Exporting…' : '⭳ Export CSV'}</button>
            {seg.type === 'active' && source && (
              <button className="plat-btn ghost" onClick={() => setEditingCriteria((v) => !v)}>{editingCriteria ? 'Cancel' : 'Edit criteria'}</button>
            )}
            <button className="plat-btn ghost" onClick={archive}>Archive</button>
          </div>
        </div>
        {seg.description && <div className="note" style={{ marginTop: 4 }}>{seg.description}</div>}
        {seg.type === 'active' && !editingCriteria && (
          <div className="note" style={{ marginTop: 6 }}>Membership is computed live from the criteria. Records join and leave automatically.</div>
        )}
        {seg.type === 'static' && (
          <div className="note" style={{ marginTop: 6 }}>Frozen snapshot. Add or remove members by hand below.</div>
        )}

        {editingCriteria && source && (
          <div style={{ marginTop: 10 }}>
            <SegmentCriteriaBuilder source={source} criteria={draftCriteria} onChange={setDraftCriteria} owners={owners} accent="var(--p-buy)" />
            <button className="plat-btn" style={{ marginTop: 8 }} disabled={savingCriteria} onClick={saveCriteria}>{savingCriteria ? 'Saving…' : 'Save criteria'}</button>
          </div>
        )}
      </div>

      {seg.type === 'static' && (
        <MemberAdder objectType={seg.object_type} onAdd={addMember} />
      )}

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          {isContact ? (
            <table className="plat-table">
              <thead>
                <tr>
                  {CONTACT_COLS.map((col) => (
                    <th key={col.key} className={col.sort ? 'th-sort' : undefined} onClick={col.sort ? () => toggleSort(col) : undefined}>
                      {col.label}{col.sort && sort === col.sort && <span className="sort-caret">{dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                    </th>
                  ))}
                  {seg.type === 'static' && <th></th>}
                </tr>
              </thead>
              <tbody>
                {(members as ContactRow[]).map((c) => (
                  <tr key={c.id}>
                    <td><button className="linklike" onClick={() => navigate(`/contacts/${c.id}`)}><b>{c.name ?? c.email ?? '(no name)'}</b></button></td>
                    <td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</td>
                    <td>{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : '—'}</td>
                    <td>{TYPE_LABEL[c.contact_type]}</td>
                    <td>{c.sales_lead_status ?? '—'}</td>
                    <td>{c.company_name ?? '—'}</td>
                    <td>{c.owner_name ?? 'Unassigned'}</td>
                    <td>{fmtDate(c.last_activity_at)}</td>
                    <td>{fmtDate(c.created_at)}</td>
                    {seg.type === 'static' && <td><button className="linklike" style={{ color: '#B4432B' }} onClick={() => removeMember(c.id)}>Remove</button></td>}
                  </tr>
                ))}
                {!loading && members.length === 0 && (
                  <tr><td colSpan={CONTACT_COLS.length + 1} style={{ textAlign: 'center', color: 'var(--p-body)' }}>No members match.</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="plat-table">
              <thead><tr><th>Name</th><th>Domain</th><th>City</th><th>State</th><th>Create Date</th>{seg.type === 'static' && <th></th>}</tr></thead>
              <tbody>
                {(members as CompanyMemberRow[]).map((co) => (
                  <tr key={co.id}>
                    <td><b>{co.name}</b></td>
                    <td>{co.domain ?? '—'}</td>
                    <td>{co.city ?? '—'}</td>
                    <td>{co.state ?? '—'}</td>
                    <td>{fmtDate(co.created_at)}</td>
                    {seg.type === 'static' && <td><button className="linklike" style={{ color: '#B4432B' }} onClick={() => removeMember(co.id)}>Remove</button></td>}
                  </tr>
                ))}
                {!loading && members.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--p-body)' }}>No members.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="plat-btn ghost" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>← Prev</button>
        <span style={{ fontSize: 12, color: 'var(--p-body)' }}>{loading ? 'Loading…' : `${total.toLocaleString()} members · page ${page} of ${pageCount.toLocaleString()}`}</span>
        <button className="plat-btn ghost" disabled={page >= pageCount || loading} onClick={() => setPage((p) => p + 1)}>Next →</button>
      </div>

      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
    </div>
  )
}

// Add-member search for static lists (contact or company).
function MemberAdder({ objectType, onAdd }: { objectType: 'contact' | 'company'; onAdd: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) { setResults([]); return }
    timer.current = setTimeout(() => {
      api.globalSearch(q.trim())
        .then((r) => setResults(r.results.filter((x) => x.type === objectType).slice(0, 6)))
        .catch(() => setResults([]))
    }, 250)
  }, [q, objectType])

  return (
    <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="note">Add {objectType}:</span>
      <div className="seg-company-picker">
        <input className="plat-input" style={{ marginBottom: 0, minWidth: 240 }} placeholder={`Search ${objectType}s to add…`} value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length > 0 && (
          <div className="seg-company-results">
            {results.map((r) => (
              <button type="button" key={r.id} className="seg-company-opt" onClick={() => { onAdd(r.id); setQ(''); setResults([]) }}>
                {r.title}{r.subtitle ? <span className="note"> · {r.subtitle}</span> : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
