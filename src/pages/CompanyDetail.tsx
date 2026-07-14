import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api, type CompanyDetailResponse, type ConsignmentDoc } from '../lib/api'
import { CALL_OUTCOME_LABEL } from '../lib/callOutcomes'
import { recordRecent } from '../lib/recentlyViewed'
import { TYPE_LABEL } from './Contacts'

// Company detail (reverses Amendment 18). HubSpot three-column shape: left
// About (real columns only), center Overview (counts + recent activity), right
// associations rail (the reason the page exists). gold-sell / teal-buy palette.

const ACT_BADGE: Record<string, { glyph: string; cls: string; label: string }> = {
  note: { glyph: '✎', cls: 'tl-note', label: 'Note' },
  call: { glyph: '☎', cls: 'tl-call', label: 'Call' },
  email: { glyph: '✉', cls: 'tl-email', label: 'Email' },
  meeting: { glyph: '◎', cls: 'tl-meeting', label: 'Meeting' },
}

function money(cents: number | null): string {
  if (cents === null) return '—'
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.trim().slice(0, 2).toUpperCase()
}
function addressLines(c: CompanyDetailResponse['company']): string[] {
  const cityLine = [c.city, c.state, c.postal_code].filter(Boolean).join(', ')
  return [c.address_line1, c.address_line2, cityLine, c.country].filter((v): v is string => !!v && v.trim() !== '')
}

export function CompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const navigate = useNavigate()

  const [data, setData] = useState<CompanyDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState({ name: '', domain: '', phone: '', address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: '', notes: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  const load = useCallback(() => {
    if (!companyId) return
    api.companyDetail(companyId)
      .then((res) => { setData(res); setError(''); recordRecent('company', res.company.id, res.company.name) })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load company'))
      .finally(() => setLoading(false))
  }, [companyId])

  useEffect(() => { load() }, [load])

  function startEdit() {
    if (!data) return
    const c = data.company
    setEdit({
      name: c.name ?? '', domain: c.domain ?? '', phone: c.phone ?? '',
      address_line1: c.address_line1 ?? '', address_line2: c.address_line2 ?? '',
      city: c.city ?? '', state: c.state ?? '', postal_code: c.postal_code ?? '',
      country: c.country ?? '', notes: c.notes ?? '',
    })
    setEditing(true)
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!companyId) return
    setSavingEdit(true)
    try {
      await api.updateCompany(companyId, {
        name: edit.name.trim(),
        domain: edit.domain.trim() || null,
        phone: edit.phone.trim() || null,
        address_line1: edit.address_line1.trim() || null,
        address_line2: edit.address_line2.trim() || null,
        city: edit.city.trim() || null,
        state: edit.state.trim() || null,
        postal_code: edit.postal_code.trim() || null,
        country: edit.country.trim() || null,
        notes: edit.notes.trim() || null,
      })
      setEditing(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingEdit(false)
    }
  }

  if (loading) return <div className="admin-loading">Loading company…</div>
  if (!data) return <div className="admin-loading">{error || 'Company not found'}</div>

  const { company, counts, contacts, contacts_total, deals, offers, activity, consignment } = data
  const addr = addressLines(company)

  return (
    <div>
      <Link to="/contacts" className="back-link">← Back to contacts</Link>

      <div className="contact-record">
        {/* ── LEFT: About this company ─────────────────────────────── */}
        <div className="crecord-col">
          <div className="panel">
            <div className="crecord-head">
              <div className="crecord-avatar" style={{ borderRadius: 8 }}>{initials(company.name)}</div>
              <div style={{ minWidth: 0 }}>
                <div className="crecord-name">{company.name}</div>
                {company.domain && (
                  <div className="note" style={{ marginTop: 2, wordBreak: 'break-all' }}>
                    <a href={`https://${company.domain.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer">{company.domain}</a>
                  </div>
                )}
              </div>
            </div>

            {editing ? (
              <form onSubmit={saveEdit} style={{ marginTop: 10 }}>
                <input className="plat-input" placeholder="Company name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                <input className="plat-input" placeholder="Domain" value={edit.domain} onChange={(e) => setEdit({ ...edit, domain: e.target.value })} />
                <input className="plat-input" placeholder="Phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
                <input className="plat-input" placeholder="Address line 1" value={edit.address_line1} onChange={(e) => setEdit({ ...edit, address_line1: e.target.value })} />
                <input className="plat-input" placeholder="Address line 2" value={edit.address_line2} onChange={(e) => setEdit({ ...edit, address_line2: e.target.value })} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="plat-input" style={{ flex: 2, minWidth: 100 }} placeholder="City" value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />
                  <input className="plat-input" style={{ flex: 1, minWidth: 60 }} placeholder="State" value={edit.state} onChange={(e) => setEdit({ ...edit, state: e.target.value })} />
                  <input className="plat-input" style={{ flex: 1, minWidth: 80 }} placeholder="Postal" value={edit.postal_code} onChange={(e) => setEdit({ ...edit, postal_code: e.target.value })} />
                </div>
                <input className="plat-input" placeholder="Country" value={edit.country} onChange={(e) => setEdit({ ...edit, country: e.target.value })} />
                <textarea className="plat-input" rows={2} placeholder="Notes" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="plat-btn" type="submit" disabled={savingEdit || !edit.name.trim()}>{savingEdit ? 'Saving…' : 'Save'}</button>
                  <button className="plat-btn ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div className="crecord-about-head">
                  <span className="crecord-section">About this company</span>
                  {isAdmin && <button className="plat-btn ghost" onClick={startEdit}>Edit</button>}
                </div>
                <div className="fieldrow"><span>Domain</span><span>{company.domain ?? '—'}</span></div>
                <div className="fieldrow"><span>Phone</span><span>{company.phone ? <a href={`tel:${company.phone}`}>{company.phone}</a> : '—'}</span></div>
                <div className="fieldrow">
                  <span>Address</span>
                  <span>{addr.length === 0 ? '—' : addr.map((l, i) => <div key={i}>{l}</div>)}</span>
                </div>
                <div className="fieldrow"><span>Notes</span><span>{company.notes ?? '—'}</span></div>
                <div className="fieldrow"><span>Created</span><span>{when(company.created_at)}</span></div>
                <div className="fieldrow"><span>Record ID</span><span className="crecord-id">{company.id}</span></div>
                <button className="plat-btn ghost" style={{ marginTop: 10, width: '100%' }} onClick={() => navigate(`/contacts?company_id=${company.id}`)}>
                  View all contacts at this company
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── CENTER: Overview ─────────────────────────────────────── */}
        <div className="crecord-col">
          <div className="panel">
            <span className="crecord-section">Overview</span>
            <div className="co-stats">
              <div className="co-stat"><div className="co-stat-n">{counts.contacts.toLocaleString()}</div><div className="co-stat-l">Contacts</div></div>
              <div className="co-stat"><div className="co-stat-n">{counts.open_deals.toLocaleString()}</div><div className="co-stat-l">Open deals</div></div>
              <div className="co-stat"><div className="co-stat-n">{counts.open_offers.toLocaleString()}</div><div className="co-stat-l">Open offers</div></div>
              <div className="co-stat"><div className="co-stat-n">{money(counts.open_deal_value_cents)}</div><div className="co-stat-l">Open deal value</div></div>
            </div>

            <div className="crecord-timeline-head" style={{ marginTop: 16 }}>
              <span className="crecord-section">Recent activity</span>
            </div>
            {activity.length === 0 ? (
              <div className="note">No recent activity across this company's contacts or deals.</div>
            ) : (
              activity.map((a) => {
                const meta = ACT_BADGE[a.kind] ?? { glyph: '•', cls: 'tl-note', label: a.kind }
                return (
                  <div className="tl-item" key={a.id}>
                    <span className={`tl-badge ${meta.cls}`}>{meta.glyph}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div>
                        <span className="tl-kind">{meta.label}</span>
                        {a.kind === 'call' && a.call_outcome && (
                          <span className="pill trans" style={{ marginLeft: 6 }}>{CALL_OUTCOME_LABEL[a.call_outcome]}</span>
                        )}
                        {a.subject && <b style={{ marginLeft: 8 }}>{a.subject}</b>}
                      </div>
                      <div style={{ margin: '3px 0' }}>{a.body}</div>
                      <div className="when">{a.rep_name ?? 'Unknown'} · {when(a.occurred_at)}</div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── RIGHT: associations rail ─────────────────────────────── */}
        <div className="crecord-col">
          <div className="panel">
            <h3>Contacts <span className="c">{contacts_total}</span></h3>
            {contacts.length === 0 ? (
              <div className="note">No contacts at this company.</div>
            ) : (
              <>
                {contacts.map((c) => (
                  <div className="hist-item" key={c.id}>
                    <button className="linklike" onClick={() => navigate(`/contacts/${c.id}`)}><b>{c.name ?? c.email ?? '(no name)'}</b></button>
                    <span className="pill grey" style={{ marginLeft: 8 }}>{TYPE_LABEL[c.contact_type]}</span>
                    <div className="when">{c.email ?? '—'}{c.owner_name ? ` · ${c.owner_name}` : ''}</div>
                  </div>
                ))}
                {contacts_total > contacts.length && (
                  <button className="plat-btn ghost" style={{ marginTop: 8 }} onClick={() => navigate(`/contacts?company_id=${company.id}`)}>
                    View all {contacts_total.toLocaleString()} contacts
                  </button>
                )}
              </>
            )}
          </div>

          <div className="panel">
            <h3>Deals <span className="c">{counts.deals}</span></h3>
            {deals.length === 0 ? (
              <div className="note">No deals reference this company.</div>
            ) : deals.map((d) => (
              <div className="hist-item" key={d.id}>
                <div>
                  <Link to={`/deals/${d.id}`}><b>{d.name}</b></Link>
                  {d.outcome && <span className={`pill ${d.outcome === 'won' ? 'green' : 'red'}`} style={{ marginLeft: 8 }}>{d.outcome}</span>}
                </div>
                <div className="when">{d.pipeline_name} · {d.stage_name} · {money(d.value_cents)}{d.owner_name ? ` · ${d.owner_name}` : ''}</div>
              </div>
            ))}
          </div>

          <div className="panel">
            <h3>Offers <span className="c">{offers.length}</span></h3>
            {offers.length === 0 ? (
              <div className="note">No offers tied to this company's deals or contacts.</div>
            ) : offers.map((o) => (
              <div className="hist-item" key={o.id}>
                <div>
                  <Link to={`/units/${o.unit_id}`} style={{ color: 'var(--p-gold)', fontWeight: 'bold' }}>
                    {o.unit_legacy_id ? `#${o.unit_legacy_id} ` : ''}{o.unit_title}
                  </Link>
                  <span className={`pill ${o.status === 'accepted' ? 'green' : o.status === 'open' ? 'gold' : 'grey'}`} style={{ marginLeft: 8 }}>
                    {o.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="when">
                  {money(o.amount_cents)}
                  {o.buyer_name ? ` · ${o.buyer_name}` : ''}
                  {o.deal_id && o.deal_name ? <> · <Link to={`/deals/${o.deal_id}`} style={{ color: 'var(--p-gold)' }}>{o.deal_name}</Link></> : ''}
                </div>
              </div>
            ))}
          </div>

          {consignment && (
            <div className="panel">
              <h3>Consignment <span className="c">{consignment.units.length}</span></h3>
              <div className="fieldrow">
                <span>Split terms</span>
                <span>{consignment.consigner.split_terms ?? '—'}{consignment.consigner.split_pct !== null ? ` · ${consignment.consigner.split_pct}%` : ''}</span>
              </div>
              <div className="fieldrow"><span>Payout status</span><span>{consignment.consigner.payout_status ?? '—'}</span></div>
              <div className="fieldrow"><span>Payment on file</span><span>{consignment.consigner.payment_details_on_file ? 'Yes' : 'No'}</span></div>
              {consignment.consigner.notes && <div className="note">{consignment.consigner.notes}</div>}

              <h4 style={{ margin: '12px 0 4px' }}>Consigned items <span className="c">{consignment.units.length}</span></h4>
              {consignment.units.length === 0 ? (
                <div className="note">No consigned units linked yet.</div>
              ) : consignment.units.map((u) => (
                <div className="hist-item" key={u.unit_id}>
                  <Link to={`/units/${u.unit_id}`} style={{ color: 'var(--p-gold)', fontWeight: 'bold' }}>
                    {u.legacy_id ? `#${u.legacy_id} ` : ''}{u.title}
                  </Link>
                  <span className="pill grey" style={{ marginLeft: 8 }}>{u.status.replace('_', ' ')}</span>
                </div>
              ))}

              <h4 style={{ margin: '12px 0 4px' }}>Contract</h4>
              <CompanyDocs docs={consignment.contract_docs} configured={consignment.documents_configured} emptyLabel="No contract on file." />
              <h4 style={{ margin: '12px 0 4px' }}>Related docs</h4>
              <CompanyDocs docs={consignment.related_docs} configured={consignment.documents_configured} emptyLabel="No related documents." />
            </div>
          )}
        </div>
      </div>
      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
    </div>
  )
}

function CompanyDocs({ docs, configured, emptyLabel }: { docs: ConsignmentDoc[]; configured: boolean; emptyLabel: string }) {
  if (!configured) return <div className="note">Document storage isn't enabled yet.</div>
  if (docs.length === 0) return <div className="note">{emptyLabel}</div>
  return (
    <>
      {docs.map((d) => (
        <div className="hist-item" key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <div>
            <b>{d.file_name}</b>
            <div className="when">{d.doc_type} · {d.uploaded_by_name ?? '—'} · {when(d.uploaded_at)}</div>
          </div>
          {d.url && <a className="plat-btn ghost" href={d.url} target="_blank" rel="noopener noreferrer">Download</a>}
        </div>
      ))}
    </>
  )
}
