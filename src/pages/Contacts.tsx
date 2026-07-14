import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, type ContactListResponse, type ContactType, type OwnerOption } from '../lib/api'

// Contacts per prototype_4 (build step 3c-5). Unlike Inventory's 798 units,
// the 20,087 backfilled contacts never load client-side: search, filters,
// and pagination are all server-side against the pg_trgm indexes. The
// inline Type select is the work-down surface for the backfill's
// contact_type='other' default (Amendment 13c).

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300

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

export function Contacts() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [debouncedQ, setDebouncedQ] = useState(q)
  const [contactType, setContactType] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const companyId = searchParams.get('company_id') ?? ''
  const [page, setPage] = useState(1)

  const [data, setData] = useState<ContactListResponse | null>(null)
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingTypeFor, setSavingTypeFor] = useState<string | null>(null)

  const [showNew, setShowNew] = useState(searchParams.get('new') === '1')
  const [nc, setNc] = useState({ first_name: '', last_name: '', email: '', phone: '', contact_type: 'other' as ContactType, hunting_for: '' })
  const [savingNew, setSavingNew] = useState(false)

  // Keep the latest request marked so a slow older response can't clobber
  // a newer one (server round-trip per keystroke batch).
  const requestSeq = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [q])

  // Deep links (?q= from the topbar search footer) must apply even when
  // the list is already mounted — the route doesn't change, only params.
  const paramQ = searchParams.get('q')
  useEffect(() => {
    if (paramQ !== null) setQ(paramQ)
  }, [paramQ])

  useEffect(() => { setPage(1) }, [debouncedQ, contactType, ownerId, companyId])

  useEffect(() => {
    const seq = ++requestSeq.current
    setLoading(true)
    api.contacts({ q: debouncedQ, contact_type: contactType, owner_id: ownerId, company_id: companyId, page, page_size: PAGE_SIZE })
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
  }, [debouncedQ, contactType, ownerId, companyId, page])

  useEffect(() => {
    api.contactOwners().then((res) => setOwners(res.owners)).catch(() => setOwners([]))
  }, [])

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
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)
  const companyFilterName = companyId
    ? (data?.contacts.find((c) => c.company_id === companyId)?.company_name ?? 'selected company')
    : null

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
          <button className="plat-btn" style={{ marginLeft: 'auto' }} onClick={() => setShowNew((v) => !v)}>
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
            <span className="note" style={{ marginLeft: 10 }}>Born in Postgres with source "rep" — mirrors to HubSpot when the step-4 outbox ships.</span>
          </form>
        </div>
      )}

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="plat-table">
          <thead>
            <tr><th>Name</th><th>Company</th><th>Type</th><th>Hunting for</th><th>Owner</th></tr>
          </thead>
          <tbody>
            {data?.contacts.map((c) => (
              <tr key={c.id} className="row-link" onClick={() => navigate(`/contacts/${c.id}`)}>
                <td>
                  <b>{c.name ?? c.email ?? '(no name)'}</b>
                  {c.email && c.name && <div className="note" style={{ marginTop: 2 }}>{c.email}</div>}
                </td>
                <td>{c.company_name ?? '—'}</td>
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
                <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.hunting_for ?? '—'}</td>
                <td>{c.owner_name ?? 'Unassigned'}</td>
              </tr>
            ))}
            {!loading && data?.contacts.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--p-body)' }}>No contacts match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="plat-btn ghost" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>← Prev</button>
        <span style={{ fontSize: 12, color: 'var(--p-body)' }}>
          {loading ? 'Loading…' : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} contacts · page ${page} of ${pageCount.toLocaleString()}`}
        </span>
        <button className="plat-btn ghost" disabled={page >= pageCount || loading} onClick={() => setPage((p) => p + 1)}>Next →</button>
      </div>

      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      <div className="note">
        The HubSpot backfill imported every contact as type "Other" — use the inline Type
        column to classify as you go. Search and paging run server-side.
      </div>
    </div>
  )
}
