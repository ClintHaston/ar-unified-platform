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

// Compact "$412K" for the valuation triplet (the doc's "FLV $412k" pattern).
export function moneyShort(cents: number | null): string {
  if (cents === null) return '—'
  const d = cents / 100
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(d >= 10_000_000 ? 0 : 2)}M`
  if (d >= 1_000) return `$${Math.round(d / 1_000)}K`
  return `$${Math.round(d)}`
}

export function snapshotAge(ageDays: number): string {
  if (ageDays === 0) return 'today'
  if (ageDays === 1) return '1 day old'
  return `${ageDays} days old`
}

// Open-offer summary for the card / list ("2 offers · top $X"). Null when
// there are no open offers (accepted offers surface via the Reserved pill).
export function offerSummary(u: Pick<UnitCard, 'open_offer_count' | 'top_open_offer_cents'>): string | null {
  if (u.open_offer_count === 0) return null
  const top = u.top_open_offer_cents !== null ? ` · top ${money(u.top_open_offer_cents)}` : ''
  return `${u.open_offer_count} offer${u.open_offer_count === 1 ? '' : 's'}${top}`
}

type InvView = 'card' | 'list'

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
  // Remember card/list choice within the session.
  const [view, setView] = useState<InvView>(() =>
    (sessionStorage.getItem('inv_view') === 'list' ? 'list' : 'card'))

  function chooseView(v: InvView) {
    setView(v)
    sessionStorage.setItem('inv_view', v)
  }

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
        // legacy_id is the TAB listing id, which is the item number a rep
        // reads off the site, so it has to be searchable here too.
        const hay = [u.title, u.serial, u.legacy_id, u.location, u.category_name, u.make_name, u.model_name]
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
          <div className="roletoggle">
            <button className={view === 'card' ? 'active' : ''} onClick={() => chooseView('card')}>Cards</button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => chooseView('list')}>List</button>
          </div>
          <button className="plat-btn" onClick={() => navigate('/inventory/intake')}>+ Intake unit</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="admin-loading">No units match these filters.</div>
      ) : view === 'card' ? (
        <div className="units">
          {filtered.map((u) => (
            <div className="unit-card" key={u.id} onClick={() => navigate(`/units/${u.id}`)}>
              {u.photo_url
                ? <div className="ph has-photo"><img src={u.photo_url} alt={u.title} loading="lazy" /></div>
                : <div className="ph">{u.category_name ?? 'Uncategorized'}</div>}
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
                {offerSummary(u) && (
                  <div className="r">
                    <span>Offers</span>
                    <span style={{ color: 'var(--p-gold)', fontWeight: 'bold' }}>{offerSummary(u)}</span>
                  </div>
                )}
                {u.valuation && (
                  <>
                    <div className="val-row">
                      <div><b>{moneyShort(u.valuation.flv_cents)}</b><small>FLV</small></div>
                      <div><b>{moneyShort(u.valuation.olv_cents)}</b><small>OLV</small></div>
                      <div><b>{moneyShort(u.valuation.fmv_cents)}</b><small>FMV</small></div>
                    </div>
                    <div className="val-meta">
                      <span className={u.valuation.stale ? 'stale' : undefined}>
                        Snapshot {snapshotAge(u.valuation.age_days)}
                        {u.valuation.stale ? ' · stale' : ''}
                      </span>
                      {u.valuation.revalue && <span className="revalue-badge">Revalue</span>}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="plat-table">
            <thead>
              <tr>
                <th>Unit</th><th>Category / Make / Model</th><th>Year</th><th>Hours</th>
                <th>Condition</th><th>Status</th><th>Asking</th><th>FLV</th><th>Offers</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/units/${u.id}`)}>
                  <td>
                    <b>{u.title}</b>
                    {u.legacy_id ? <span style={{ color: 'var(--p-body)' }}> · #{u.legacy_id}</span> : null}
                  </td>
                  <td style={{ color: 'var(--p-body)' }}>
                    {[u.category_name, u.make_name, u.model_name].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td>{u.year ?? '—'}</td>
                  <td>{u.hours !== null ? u.hours.toLocaleString() : '—'}</td>
                  <td>{u.condition ?? '—'}</td>
                  <td>
                    <span className={`pill ${STATUS_PILL[u.status]}`}>
                      {statusPillText(u)}{u.archived ? ' · arch' : ''}
                    </span>
                  </td>
                  <td style={{ fontWeight: 'bold' }}>{money(u.asking_price_cents)}</td>
                  <td>
                    {u.valuation ? (
                      <>
                        {moneyShort(u.valuation.flv_cents)}
                        <span style={{ color: 'var(--p-body)', fontSize: 11 }}>
                          {' · '}{snapshotAge(u.valuation.age_days)}{u.valuation.stale ? ' · stale' : ''}
                        </span>
                      </>
                    ) : '—'}
                  </td>
                  <td>{offerSummary(u) ?? <span style={{ color: 'var(--p-body)' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      <div className="note">
        The 798 TAB-backfilled units. Taxonomy links are partial by design (TAB make/model
        were free text). Open a unit to assign its category, make, and model.
      </div>
    </div>
  )
}
