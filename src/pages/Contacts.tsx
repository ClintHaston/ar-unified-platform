import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api, type ContactListResponse, type ContactSort, type ContactType, type OwnerOption, type SegmentListItem, type SortDir } from '../lib/api'

// Contacts per prototype_4 (build step 3c-5), rebuilt for HubSpot list-view
// parity. Unlike Inventory's 798 units, the 20,087 backfilled contacts never
// load client-side: search, filters, sort, and pagination are all
// server-side against the pg_trgm + base indexes. The inline Type select is
// the work-down surface for the backfill's contact_type='other' default
// (Amendment 13c). Multi-select drives a bulk owner-reassign (admin-only,
// server-enforced) and a CSV export of the current filtered set.

const SEARCH_DEBOUNCE_MS = 300
const PAGE_SIZES = [25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 50

export const TYPE_LABEL: Record<ContactType, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  consigner_contact: 'Consigner',
  other: 'Other',
}

export const TYPE_PILL: Record<ContactType, string> = {
  buyer: 'green',
  seller: 'trans',
  consigner_contact: 'gold',
  other: 'grey',
}

export function ownerLabel(o: OwnerOption): string {
  return o.is_active ? o.name : `${o.name} (inactive)`
}

// timestamptz columns carry their offset, so new Date() is safe here (the
// UTC-midnight shift gotcha only bites date-ONLY columns).
export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

// Sortable column definitions in render order. `sort` present ⇒ header is a
// sort button. Newest-first defaults for the date columns read better.
interface Column {
  key: string
  label: string
  sort?: ContactSort
  descFirst?: boolean
}
const COLUMNS: Column[] = [
  { key: 'name', label: 'Name', sort: 'name' },
  { key: 'email', label: 'Email', sort: 'email' },
  { key: 'phone', label: 'Phone' },
  { key: 'type', label: 'Type', sort: 'type' },
  { key: 'lead_status', label: 'Lead Status', sort: 'lead_status' },
  { key: 'company', label: 'Primary Company', sort: 'company' },
  { key: 'owner', label: 'Contact Owner', sort: 'owner' },
  { key: 'last_activity', label: 'Last Activity', sort: 'last_activity', descFirst: true },
  { key: 'created', label: 'Create Date', sort: 'created', descFirst: true },
]

export function Contacts() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [searchParams, setSearchParams] = useSearchParams()

  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [debouncedQ, setDebouncedQ] = useState(q)
  const [contactType, setContactType] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const companyId = searchParams.get('company_id') ?? ''
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [sort, setSort] = useState<ContactSort>('name')
  const [dir, setDir] = useState<SortDir>('asc')

  const [data, setData] = useState<ContactListResponse | null>(null)
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingTypeFor, setSavingTypeFor] = useState<string | null>(null)

  // Multi-select (per page): a Set of contact ids, cleared whenever the
  // visible rows change so a bulk action never touches an unseen row.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOwner, setBulkOwner] = useState('')
  const [applyingBulk, setApplyingBulk] = useState(false)
  const [exporting, setExporting] = useState(false)

  // "Add to list" — static contact lists only (active lists are criteria-driven)
  const [addToListOpen, setAddToListOpen] = useState(false)
  const [staticLists, setStaticLists] = useState<SegmentListItem[]>([])
  const [newListName, setNewListName] = useState('')
  const [addingToList, setAddingToList] = useState(false)
  const [notice, setNotice] = useState('')

  const [showNew, setShowNew] = useState(searchParams.get('new') === '1')
  const [nc, setNc] = useState({ first_name: '', last_name: '', email: '', phone: '', contact_type: 'other' as ContactType, hunting_for: '' })
  const [savingNew, setSavingNew] = useState(false)

  const requestSeq = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [q])

  const paramQ = searchParams.get('q')
  useEffect(() => {
    if (paramQ !== null) setQ(paramQ)
  }, [paramQ])

  useEffect(() => { setPage(1) }, [debouncedQ, contactType, ownerId, companyId, sort, dir, pageSize])
  // Rows change ⇒ drop the selection (per-page semantics).
  useEffect(() => { setSelected(new Set()); setBulkOwner('') }, [debouncedQ, contactType, ownerId, companyId, sort, dir, page, pageSize])

  const listParams = useMemo(() => ({
    q: debouncedQ, contact_type: contactType, owner_id: ownerId,
    company_id: companyId, sort, dir,
  }), [debouncedQ, contactType, ownerId, companyId, sort, dir])

  useEffect(() => {
    const seq = ++requestSeq.current
    setLoading(true)
    api.contacts({ ...listParams, page, page_size: pageSize })
      .then((res) => {
        if (seq !== requestSeq.current) return
        setData(res)
        setError('')
      })
      .catch((err: unknown) => {
        if (seq !== requestSeq.current) return
        setError(err instanceof Error ? err.message : 'Failed to load contacts')
      })
      .finally(() => { if (seq === requestSeq.current) setLoading(false) })
  }, [listParams, page, pageSize])

  useEffect(() => {
    api.contactOwners().then((res) => setOwners(res.owners)).catch(() => setOwners([]))
  }, [])

  function toggleSort(col: Column) {
    if (!col.sort) return
    if (sort === col.sort) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(col.sort)
      setDir(col.descFirst ? 'desc' : 'asc')
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const pageIds = data?.contacts.map((c) => c.id) ?? []
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const someOnPageSelected = pageIds.some((id) => selected.has(id))

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }

  async function setRowType(contactId: string, type: ContactType) {
    setSavingTypeFor(contactId)
    try {
      await api.updateContact(contactId, { contact_type: type })
      setData((prev) => prev === null ? prev : {
        ...prev,
        contacts: prev.contacts.map((c) => c.id === contactId ? { ...c, contact_type: type } : c),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update type')
    } finally {
      setSavingTypeFor(null)
    }
  }

  async function applyBulkOwner() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setApplyingBulk(true)
    setError('')
    try {
      await api.batchReassignContactOwner(ids, bulkOwner || null)
      const ownerName = bulkOwner ? (owners.find((o) => o.id === bulkOwner)?.name ?? null) : null
      setData((prev) => prev === null ? prev : {
        ...prev,
        contacts: prev.contacts.map((c) => selected.has(c.id)
          ? { ...c, owner_id: bulkOwner || null, owner_name: ownerName }
          : c),
      })
      setSelected(new Set())
      setBulkOwner('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reassign owner')
    } finally {
      setApplyingBulk(false)
    }
  }

  function openAddToList() {
    setAddToListOpen((v) => !v)
    setNotice('')
    api.listSegments({ object_type: 'contact', type: 'static' })
      .then((r) => setStaticLists(r.segments)).catch(() => setStaticLists([]))
  }

  async function addSelectionToList(listId: string, listName: string) {
    setAddingToList(true)
    setError('')
    try {
      const res = await api.addSegmentMembers(listId, Array.from(selected))
      setAddToListOpen(false)
      setNotice(`Added ${res.added} to "${listName}"${res.added < res.requested ? ` (${res.requested - res.added} already on it)` : ''}.`)
      setSelected(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to list')
    } finally {
      setAddingToList(false)
    }
  }

  async function createListFromSelection() {
    if (!newListName.trim()) return
    setAddingToList(true)
    setError('')
    try {
      const created = await api.createSegment({
        name: newListName.trim(), object_type: 'contact', type: 'static',
        member_ids: Array.from(selected),
      })
      navigate(`/lists/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create list')
      setAddingToList(false)
    }
  }

  async function exportCsv() {
    setExporting(true)
    setError('')
    try {
      const blob = await api.exportContactsCsv(listParams)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'contacts.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  async function submitNew(e: FormEvent) {
    e.preventDefault()
    setSavingNew(true)
    try {
      const created = await api.createContact({
        first_name: nc.first_name.trim() || undefined,
        last_name: nc.last_name.trim() || undefined,
        email: nc.email.trim() || undefined,
        phone: nc.phone.trim() || undefined,
        contact_type: nc.contact_type,
        hunting_for: nc.hunting_for.trim() || undefined,
      })
      navigate(`/contacts/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create contact')
      setSavingNew(false)
    }
  }

  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const companyFilterName = companyId
    ? (data?.contacts.find((c) => c.company_id === companyId)?.company_name ?? 'selected company')
    : null
  const selectedCount = selected.size

  return (
    <div>
      <div className="panel" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="plat-input"
            style={{ marginBottom: 0, maxWidth: 260 }}
            placeholder="Search name, email, phone, company…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="plat-input" style={{ marginBottom: 0, maxWidth: 150 }} value={contactType} onChange={(e) => setContactType(e.target.value)}>
            <option value="">All types</option>
            {(Object.keys(TYPE_LABEL) as ContactType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
          <select className="plat-input" style={{ marginBottom: 0, maxWidth: 200 }} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">All owners</option>
            <option value="none">Unassigned</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{ownerLabel(o)}</option>
            ))}
          </select>
          {companyId && (
            <button className="plat-btn ghost" onClick={() => setSearchParams({})}>
              Company: {companyFilterName} ✕
            </button>
          )}
          <button className="plat-btn ghost" onClick={exportCsv} disabled={exporting || total === 0}>
            {exporting ? 'Exporting…' : '⭳ Export CSV'}
          </button>
          <button className="plat-btn" onClick={() => setShowNew((v) => !v)}>
            {showNew ? 'Cancel' : '+ New contact'}
          </button>
        </div>
      </div>

      {showNew && (
        <div className="panel">
          <h3>New contact</h3>
          <form onSubmit={submitNew}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="plat-input" style={{ flex: 1, minWidth: 140 }} placeholder="First name" value={nc.first_name} onChange={(e) => setNc({ ...nc, first_name: e.target.value })} />
              <input className="plat-input" style={{ flex: 1, minWidth: 140 }} placeholder="Last name" value={nc.last_name} onChange={(e) => setNc({ ...nc, last_name: e.target.value })} />
              <input className="plat-input" style={{ flex: 1, minWidth: 180 }} placeholder="Email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
              <input className="plat-input" style={{ flex: 1, minWidth: 130 }} placeholder="Phone" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
              <select className="plat-input" style={{ maxWidth: 140 }} value={nc.contact_type} onChange={(e) => setNc({ ...nc, contact_type: e.target.value as ContactType })}>
                {(Object.keys(TYPE_LABEL) as ContactType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <input className="plat-input" placeholder="Hunting for (feeds buyer-need matching)…" value={nc.hunting_for} onChange={(e) => setNc({ ...nc, hunting_for: e.target.value })} />
            <button className="plat-btn" type="submit" disabled={savingNew || !(nc.first_name.trim() || nc.last_name.trim() || nc.email.trim())}>
              {savingNew ? 'Creating…' : 'Create contact'}
            </button>
            <span className="note" style={{ marginLeft: 10 }}>Born in Postgres with source "rep". Mirrors to HubSpot when the step-4 outbox ships.</span>
          </form>
        </div>
      )}

      {selectedCount > 0 && (
        <div className="panel bulk-bar">
          <b>{selectedCount} selected</b>
          {isAdmin ? (
            <>
              <span className="note">Reassign owner:</span>
              <select className="plat-input" style={{ marginBottom: 0, maxWidth: 200 }} value={bulkOwner} onChange={(e) => setBulkOwner(e.target.value)}>
                <option value="">Unassigned</option>
                {owners.filter((o) => o.is_active).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <button className="plat-btn" onClick={applyBulkOwner} disabled={applyingBulk}>
                {applyingBulk ? 'Applying…' : 'Apply'}
              </button>
            </>
          ) : (
            <span className="note">Owner reassignment is admin-only.</span>
          )}
          <div className="seg-company-picker">
            <button className="plat-btn ghost" onClick={openAddToList}>Add to list ▾</button>
            {addToListOpen && (
              <div className="add-to-list-pop">
                <div className="note" style={{ marginBottom: 6 }}>Add {selectedCount} to a static list:</div>
                {staticLists.length === 0 && <div className="note">No static contact lists yet.</div>}
                {staticLists.map((l) => (
                  <button key={l.id} type="button" className="seg-company-opt" disabled={addingToList}
                          onClick={() => addSelectionToList(l.id, l.name)}>
                    {l.name} <span className="note">· {l.count.toLocaleString()}</span>
                  </button>
                ))}
                <div className="add-to-list-new">
                  <input className="plat-input" style={{ marginBottom: 0 }} placeholder="New static list…"
                         value={newListName} onChange={(e) => setNewListName(e.target.value)} />
                  <button className="plat-btn" disabled={addingToList || !newListName.trim()} onClick={createListFromSelection}>Create</button>
                </div>
              </div>
            )}
          </div>
          <button className="plat-btn ghost" style={{ marginLeft: 'auto' }} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
      {notice && <div className="note" style={{ color: 'var(--p-buy)' }}>{notice}</div>}

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="plat-table">
            <thead>
              <tr>
                <th style={{ width: 34 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allOnPageSelected}
                    ref={(el) => { if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected }}
                    onChange={toggleSelectAll}
                  />
                </th>
                {COLUMNS.map((col) => (
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
              {data?.contacts.map((c) => (
                <tr key={c.id} className={selected.has(c.id) ? 'row-selected' : undefined}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${c.name ?? c.email ?? 'contact'}`}
                      checked={selected.has(c.id)}
                      onChange={() => toggleRow(c.id)}
                    />
                  </td>
                  <td>
                    <button className="linklike" onClick={() => navigate(`/contacts/${c.id}`)}>
                      <b>{c.name ?? c.email ?? '(no name)'}</b>
                    </button>
                  </td>
                  <td>{c.email ? <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>{c.email}</a> : '—'}</td>
                  <td>{c.phone ? <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()}>{c.phone}</a> : '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select
                      className="plat-input type-select"
                      value={c.contact_type}
                      disabled={savingTypeFor === c.id}
                      onChange={(e) => setRowType(c.id, e.target.value as ContactType)}
                    >
                      {(Object.keys(TYPE_LABEL) as ContactType[]).map((t) => (
                        <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                  </td>
                  <td>{c.sales_lead_status ?? '—'}</td>
                  <td>
                    {c.company_name && c.company_id
                      ? <button className="linklike" onClick={() => navigate(`/companies/${c.company_id}`)}>{c.company_name}</button>
                      : (c.company_name ?? '—')}
                  </td>
                  <td>{c.owner_name ?? 'Unassigned'}</td>
                  <td>{fmtDate(c.last_activity_at)}</td>
                  <td>{fmtDate(c.created_at)}</td>
                </tr>
              ))}
              {!loading && data?.contacts.length === 0 && (
                <tr><td colSpan={COLUMNS.length + 1} style={{ textAlign: 'center', color: 'var(--p-body)' }}>No contacts match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button className="plat-btn ghost" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>← Prev</button>
        <span style={{ fontSize: 12, color: 'var(--p-body)' }}>
          {loading ? 'Loading…' : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} contacts · page ${page} of ${pageCount.toLocaleString()}`}
        </span>
        <button className="plat-btn ghost" disabled={page >= pageCount || loading} onClick={() => setPage((p) => p + 1)}>Next →</button>
        <label style={{ fontSize: 12, color: 'var(--p-body)', marginLeft: 'auto' }}>
          Per page{' '}
          <select className="plat-input" style={{ marginBottom: 0, width: 76, display: 'inline-block' }} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      <div className="note">
        The HubSpot backfill imported every contact as type "Other". Use the inline Type
        column to classify as you go. Search, sort, and paging run server-side.
      </div>
    </div>
  )
}
