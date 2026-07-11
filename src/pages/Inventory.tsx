import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type TaxonomyLists, type UnitCard, type UnitStatus } from '../lib/api'

// Inventory per prototype_4: card grid with status pills. The 798 backfilled
// TAB units load once; search and taxonomy filters run client-side. Filters
// are tolerant of the NULL taxonomy links (TAB make/model were free text —
// only 313/233/51 linked at import): "No category"/"No make" are first-class
// filter choices so the gaps can be found and worked down in-app.

const NONE = '__none__'

const STATUS_LABEL: Record<UnitStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  in_transport: 'In transport',
  under_maintenance: 'In maintenance',
  sold: 'Sold',
}

export const STATUS_PILL: Record<UnitStatus, string> = {
  available: 'av',
  reserved: 'res',
  in_transport: 'trans',
  under_maintenance: 'maint',
  sold: 'sold',
}

export function money(cents: number | null): string {
  if (cents === null) return '—'
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function statusPillText(u: Pick<UnitCard, 'status' | 'reserved_until'>): string {
  if (u.status === 'reserved' && u.reserved_until) {
    return `Reserved until ${shortDate(u.reserved_until)}`
  }
  return STATUS_LABEL[u.status]
}

export function Inventory() {
  const navigate = useNavigate()
  const [units, setUnits] = useState<UnitCard[]>([])
  const [taxonomy, setTaxonomy] = useState<TaxonomyLists | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [makeId, setMakeId] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([api.units(showArchived), api.taxonomy()])
      .then(([u, t]) => { setUnits(u.units); setTaxonomy(t); setError('') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load inventory'))
      .finally(() => setLoading(false))
  }, [showArchived])

  // Only offer filter values that actually occur in the data, so the
  // dropdowns stay short and every choice returns something.
  const usedCategoryIds = useMemo(() => new Set(units.map((u) => u.category_id).filter(Boolean)), [units])
  const usedMakeIds = useMemo(() => new Set(units.map((u) => u.make_id).filter(Boolean)), [units])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return units.filter((u) => {
      if (!showArchived && u.archived) return false
      if (status && u.status !== status) return false
      if (categoryId === NONE ? u.category_id !== null : categoryId && u.category_id !== categoryId) return false
      if (makeId === NONE ? u.make_id !== null : makeId && u.make_id !== makeId) return false
      if (needle) {
        const hay = [u.title, u.serial, u.location, u.category_name, u.make_name, u.model_name]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [units, q, status, categoryId, makeId, showArchived])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const u of units) {
      if (u.archived) continue
      counts[u.status] = (counts[u.status] ?? 0) + 1
    }
    return counts
  }, [units])

  if (loading) return <div className="admin-loading">Loading inventory…</div>
  if (error && units.length === 0) return <div className="admin-loading">{error}</div>

  return (
    <div>
      <div className="panel" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="plat-input"
            style={{ marginBottom: 0, maxWidth: 240 }}
            placeholder="Search title, serial, location…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="plat-input" style={{ marginBottom: 0, maxWidth: 170 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as UnitStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]} ({statusCounts[s] ?? 0})</option>
            ))}
          </select>
          <select className="plat-input" style={{ marginBottom: 0, maxWidth: 200 }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            <option value={NONE}>No category (unlinked)</option>
            {taxonomy?.categories.filter((c) => usedCategoryIds.has(c.id)).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className="plat-input" style={{ marginBottom: 0, maxWidth: 180 }} value={makeId} onChange={(e) => setMakeId(e.target.value)}>
            <option value="">All makes</option>
            <option value={NONE}>No make (unlinked)</option>
            {taxonomy?.makes.filter((m) => usedMakeIds.has(m.id)).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: 'var(--p-body)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Archived
          </label>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--p-body)' }}>
            {filtered.length} of {units.filter((u) => showArchived || !u.archived).length} units
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="admin-loading">No units match these filters.</div>
      ) : (
        <div className="units">
          {filtered.map((u) => (
            <div className="unit-card" key={u.id} onClick={() => navigate(`/units/${u.id}`)}>
              <div className="ph">{u.category_name ?? 'Uncategorized'}</div>
              <div className="bd">
                <div className="ti">{u.title}</div>
                <div className="sub">
                  {[u.make_name && u.model_name ? `${u.make_name} ${u.model_name}` : u.make_name,
                    u.hours !== null ? `${u.hours.toLocaleString()} hr` : null,
                    u.location]
                    .filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="r">
                  <span>Status</span>
                  <span className={`pill ${STATUS_PILL[u.status]}`}>
                    {statusPillText(u)}{u.archived ? ' · archived' : ''}
                  </span>
                </div>
                <div className="r">
                  <span>Asking</span>
                  <span style={{ fontWeight: 'bold' }}>{money(u.asking_price_cents)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      <div className="note">
        The 798 TAB-backfilled units. Taxonomy links are partial by design (TAB make/model
        were free text) — open a unit to assign its category, make, and model.
      </div>
    </div>
  )
}
