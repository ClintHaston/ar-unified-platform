import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  api, type BuyerOppDetailResponse, type BuyerOppUnit, type InterestStatus,
  type SearchResult, type UnitOffer,
} from '../lib/api'

// Buyer opportunity detail (build step 4e). Buyer + owning rep + free notes +
// buy-side stage on the left; the interested-units list (the M2M interest
// layer, per-unit target price + interest status + optional offer link) and
// stage history. Editing is gated to the owner/admin (can_edit from the API,
// and the server enforces it regardless).

const INTEREST_LABEL: Record<InterestStatus, string> = {
  info_sent: 'Info sent',
  negotiating: 'Negotiating',
  cooling: 'Cooling',
  offer_made: 'Offer made',
}
const INTEREST_PILL: Record<InterestStatus, string> = {
  info_sent: 'buy',
  negotiating: 'gold',
  cooling: 'grey',
  offer_made: 'green',
}
const INTEREST_OPTIONS: InterestStatus[] = ['info_sent', 'negotiating', 'cooling', 'offer_made']

function money(cents: number | null): string {
  if (cents === null || cents === undefined) return '—'
  const dollars = cents / 100
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}K`
  return `$${Math.round(dollars)}`
}

function when(iso: string): string {
  return new Date(iso).toLocaleString()
}

function centsFromInput(v: string): number | null {
  const n = parseFloat(v.replace(/[^0-9.]/g, ''))
  if (Number.isNaN(n)) return null
  return Math.round(n * 100)
}

export function BuyerOpportunityDetail() {
  const { opportunityId } = useParams<{ opportunityId: string }>()
  const [data, setData] = useState<BuyerOppDetailResponse | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [notesDraft, setNotesDraft] = useState('')

  // attach-unit form
  const [uq, setUq] = useState('')
  const [uhits, setUhits] = useState<SearchResult[]>([])
  const [targetInput, setTargetInput] = useState('')

  const load = useCallback(() => {
    if (!opportunityId) return
    api.buyerOpportunityDetail(opportunityId)
      .then((res) => { setData(res); setNotesDraft(res.opportunity.notes ?? ''); setError('') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
  }, [opportunityId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (uq.trim().length < 2) { setUhits([]); return }
    let live = true
    api.globalSearch(uq.trim())
      .then((res) => { if (live) setUhits(res.results.filter((r) => r.type === 'unit')) })
      .catch(() => { if (live) setUhits([]) })
    return () => { live = false }
  }, [uq])

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key)
    setError('')
    try { await fn(); load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Action failed') }
    finally { setBusy('') }
  }

  if (error && !data) return <div className="admin-loading">{error}</div>
  if (!data) return <div className="admin-loading">Loading buyer opportunity…</div>

  const { opportunity: o, stages, units, stage_history } = data
  const canEdit = o.can_edit

  async function attachUnit(unitId: string) {
    if (!opportunityId) return
    const target = centsFromInput(targetInput)
    await run('attach', () => api.attachBuyerUnit(opportunityId, {
      unit_id: unitId,
      target_price_cents: target,
    }).then(() => { setUq(''); setUhits([]); setTargetInput('') }))
  }

  return (
    <div>
      <Link to="/buyer-opportunities" className="back-link">← Back to buyer opportunities</Link>

      <div className="detail-grid">
        <div>
          <div className="panel">
            <h3>
              {o.name}
              <span className="pill buy" style={{ marginLeft: 8 }}>Buy-side</span>
              {o.outcome && (
                <span className={`pill ${o.outcome === 'won' ? 'green' : 'red'}`} style={{ marginLeft: 6 }}>
                  {o.outcome === 'won' ? 'Won' : 'Lost'}
                </span>
              )}
            </h3>
            <div className="fieldrow"><span>Buyer</span>
              <b><Link to={`/contacts/${o.buyer_contact_id}`} style={{ color: 'var(--p-gold)' }}>{o.buyer_name ?? 'Unnamed'}</Link></b>
            </div>
            {o.company_name && <div className="fieldrow"><span>Company</span><b>{o.company_name}</b></div>}
            {o.buyer_email && <div className="fieldrow"><span>Email</span><b>{o.buyer_email}</b></div>}
            {o.buyer_phone && <div className="fieldrow"><span>Phone</span><b>{o.buyer_phone}</b></div>}
            <div className="fieldrow"><span>Owner</span><b>{o.owner_name ?? 'Unassigned'}</b></div>
            <div className="fieldrow"><span>Stage</span>
              <b>
                {canEdit ? (
                  <select
                    className="plat-input"
                    style={{ width: 'auto', display: 'inline-block' }}
                    value={o.stage_id}
                    disabled={busy !== ''}
                    onChange={(e) => run('move', () => api.moveBuyerOpportunity(o.id, e.target.value))}
                  >
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : o.stage_name}
              </b>
            </div>
            <div className="fieldrow"><span>Created</span><b>{when(o.created_at)}</b></div>
          </div>

          <div className="panel">
            <h3>Notes</h3>
            {canEdit ? (
              <>
                <textarea
                  className="plat-input"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  style={{ minHeight: 70, resize: 'vertical' }}
                  placeholder="What is this buyer hunting for? Budget, timing, constraints…"
                />
                <div style={{ marginTop: 6 }}>
                  <button
                    className="plat-btn"
                    disabled={busy !== '' || notesDraft === (o.notes ?? '')}
                    onClick={() => run('notes', () => api.editBuyerOpportunity(o.id, { notes: notesDraft }))}
                  >
                    {busy === 'notes' ? 'Saving…' : 'Save notes'}
                  </button>
                </div>
              </>
            ) : (
              <div className="note">{o.notes || 'No notes.'}</div>
            )}
          </div>

          <div className="panel">
            <h3>Interested units <span className="c">{units.length}</span></h3>
            <div className="note" style={{ marginTop: 0 }}>
              Interest only — attaching a unit never changes its availability. To actually reserve a
              unit, log and accept an offer on the unit itself.
            </div>

            {canEdit && (
              <div style={{ border: '1px solid var(--p-steel)', borderRadius: 8, padding: '10px 12px', margin: '10px 0' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    className="plat-input"
                    style={{ flex: 2, minWidth: 180 }}
                    placeholder="Search a unit to add…"
                    value={uq}
                    onChange={(e) => setUq(e.target.value)}
                  />
                  <input
                    className="plat-input"
                    style={{ flex: 1, minWidth: 120 }}
                    placeholder="Target price (optional)"
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                  />
                </div>
                {uhits.length > 0 && (
                  <div style={{ border: '1px solid var(--p-steel)', borderRadius: 6, marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
                    {uhits.map((h) => (
                      <div
                        key={h.id}
                        onClick={() => attachUnit(h.id)}
                        style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--p-row)' }}
                      >
                        <b>{h.title}</b>
                        {h.subtitle ? <span style={{ color: 'var(--p-body)' }}> · {h.subtitle}</span> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {units.length === 0 ? (
              <div className="note">No units attached yet.</div>
            ) : (
              units.map((u) => (
                <UnitLinkRow
                  key={u.link_id}
                  oppId={o.id}
                  link={u}
                  canEdit={canEdit}
                  busy={busy}
                  onChange={load}
                  setError={setError}
                />
              ))
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <h3>Stage history</h3>
            {stage_history.length === 0 ? (
              <div className="note">No stage changes yet.</div>
            ) : (
              stage_history.map((h, i) => (
                <div className="hist-item" key={i}>
                  <div>
                    <b>{h.from_stage ? `${h.from_stage} → ` : ''}{h.to_stage}</b>
                    <div className="when">{h.actor_name ?? 'System'} · {when(h.at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
    </div>
  )
}

interface UnitLinkRowProps {
  oppId: string
  link: BuyerOppUnit
  canEdit: boolean
  busy: string
  onChange: () => void
  setError: (s: string) => void
}

function UnitLinkRow({ oppId, link, canEdit, busy, onChange, setError }: UnitLinkRowProps) {
  const [linking, setLinking] = useState(false)
  const [offers, setOffers] = useState<UnitOffer[] | null>(null)

  async function patch(fn: () => Promise<unknown>) {
    setError('')
    try { await fn(); onChange() }
    catch (err) { setError(err instanceof Error ? err.message : 'Update failed') }
  }

  async function openOfferPicker() {
    setLinking(true)
    try {
      const detail = await api.unitDetail(link.unit_id)
      setOffers(detail.offers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load offers')
      setLinking(false)
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--p-row)', padding: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <Link to={`/units/${link.unit_id}`} style={{ color: 'var(--p-gold)', fontWeight: 'bold' }}>
            {link.unit_title}
          </Link>
          <span className={`pill ${link.unit_status === 'available' ? 'av' : link.unit_status === 'reserved' ? 'res' : link.unit_status === 'sold' ? 'sold' : 'grey'}`} style={{ marginLeft: 8 }}>
            {link.unit_status.replace('_', ' ')}
          </span>
          <div className="when">
            Asking {money(link.asking_price_cents)} · Target {money(link.target_price_cents)}
          </div>
        </div>
        {canEdit ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexShrink: 0 }}>
            <select
              className="plat-input"
              style={{ width: 'auto' }}
              value={link.interest_status}
              disabled={busy !== ''}
              onChange={(e) => patch(() => api.updateBuyerUnit(oppId, link.link_id, { interest_status: e.target.value as InterestStatus }))}
            >
              {INTEREST_OPTIONS.map((s) => <option key={s} value={s}>{INTEREST_LABEL[s]}</option>)}
            </select>
            <button
              className="plat-btn ghost"
              disabled={busy !== ''}
              onClick={() => patch(() => api.detachBuyerUnit(oppId, link.link_id))}
            >
              Detach
            </button>
          </div>
        ) : (
          <span className={`pill ${INTEREST_PILL[link.interest_status]}`}>{INTEREST_LABEL[link.interest_status]}</span>
        )}
      </div>

      {link.note && <div className="when" style={{ marginTop: 4 }}>{link.note}</div>}

      <div style={{ marginTop: 6 }}>
        {link.offer_id ? (
          <span style={{ fontSize: 12 }}>
            <span className="pill green">Offer linked</span>{' '}
            {money(link.offer_amount_cents)} · {link.offer_status}
            {canEdit && (
              <button
                className="plat-btn ghost"
                style={{ marginLeft: 8 }}
                onClick={() => patch(() => api.updateBuyerUnit(oppId, link.link_id, { clear_offer: true }))}
              >
                Unlink
              </button>
            )}
          </span>
        ) : canEdit ? (
          linking ? (
            offers === null ? (
              <span className="note">Loading offers…</span>
            ) : offers.length === 0 ? (
              <span className="note">
                No offers on this unit yet. <Link to={`/units/${link.unit_id}`} style={{ color: 'var(--p-gold)' }}>Log one on the unit →</Link>
              </span>
            ) : (
              <div style={{ border: '1px solid var(--p-steel)', borderRadius: 6, padding: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--p-body)', marginBottom: 4 }}>Link the resulting offer (locks nothing):</div>
                {offers.map((of) => (
                  <div
                    key={of.id}
                    onClick={() => patch(() => api.updateBuyerUnit(oppId, link.link_id, { offer_id: of.id }))}
                    style={{ padding: '4px 6px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--p-row)' }}
                  >
                    {money(of.amount_cents)} · {of.status} · {of.buyer_name ?? '—'} (rep {of.rep_name ?? '—'})
                  </div>
                ))}
                <button className="plat-btn ghost" style={{ marginTop: 4 }} onClick={() => { setLinking(false); setOffers(null) }}>Close</button>
              </div>
            )
          ) : (
            <button className="plat-btn ghost" onClick={openOfferPicker}>Link an offer…</button>
          )
        ) : null}
      </div>
    </div>
  )
}
