import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  api, type ContactHit, type TaxonomyLists, type UnitDetailResponse,
  type ValuationRun, type ValuationSnapshot,
} from '../lib/api'
import { STATUS_PILL, money, moneyShort, snapshotAge, statusPillText } from './Inventory'

// Unit detail per prototype_4 + §3: fields, inline taxonomy assignment,
// status history from unit_status_events, expenses (no workflow — held
// line), and the Offer flow. Accepting an offer is the single action that
// reserves the unit; the server enforces every state-machine transition,
// so this page just surfaces the verdicts (409/422 details) verbatim.

const TRANSITION_LABEL: Record<string, string> = {
  available: 'Mark available',
  sold: 'Mark sold',
  in_transport: 'Move to transport',
  under_maintenance: 'Move to maintenance',
}

const OFFER_PILL: Record<string, string> = {
  open: 'gold', accepted: 'green', declined: 'red', expired: 'grey', withdrawn: 'grey',
  fell_through: 'red',
}

const OFFER_STATUS_LABEL: Record<string, string> = {
  fell_through: 'fell through',
}

// 3c-4 job zero: releasing a reservation is a one-choice reason, note optional.
const RELEASE_CHOICES = [
  { value: 'buyer_fell_through', label: 'Buyer fell through' },
  { value: 'withdrawn_by_us', label: 'Withdrawn by us' },
] as const

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Date-only values (expenses.incurred_on) must not go through new Date(iso):
// that parses as UTC midnight and renders the previous day in Central.
function dateOnly(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString()
}

export function UnitDetail() {
  const { unitId } = useParams<{ unitId: string }>()
  const [data, setData] = useState<UnitDetailResponse | null>(null)
  const [taxonomy, setTaxonomy] = useState<TaxonomyLists | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  // inline taxonomy editor
  const [editTax, setEditTax] = useState(false)
  const [taxCat, setTaxCat] = useState('')
  const [taxMake, setTaxMake] = useState('')
  const [taxModel, setTaxModel] = useState('')

  // transition note (server requires it on some paths)
  const [transitionNote, setTransitionNote] = useState('')

  // release-reservation reason flow (3c-4 job zero)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [releaseReason, setReleaseReason] = useState('')
  const [releaseNote, setReleaseNote] = useState('')

  // valuation run → review → save (3c-4)
  const [valRun, setValRun] = useState<ValuationRun | null>(null)
  const [snapshots, setSnapshots] = useState<ValuationSnapshot[]>([])
  const [showValHistory, setShowValHistory] = useState(false)

  // expense form
  const [expCategory, setExpCategory] = useState('transport')
  const [expAmount, setExpAmount] = useState('')
  const [expDate, setExpDate] = useState('')
  const [expNote, setExpNote] = useState('')

  // offer form
  const [contactQuery, setContactQuery] = useState('')
  const [contactHits, setContactHits] = useState<ContactHit[]>([])
  const [buyer, setBuyer] = useState<ContactHit | null>(null)
  const [offerAmount, setOfferAmount] = useState('')
  const [offerExpiry, setOfferExpiry] = useState('')
  const [offerNote, setOfferNote] = useState('')

  const load = useCallback(() => {
    if (!unitId) return
    api.unitDetail(unitId)
      .then((res) => {
        setData(res)
        setTaxCat(res.unit.category_id ?? '')
        setTaxMake(res.unit.make_id ?? '')
        setTaxModel(res.unit.model_id ?? '')
        setError('')
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load unit'))
      .finally(() => setLoading(false))
  }, [unitId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.taxonomy().then(setTaxonomy).catch(() => setTaxonomy(null))
  }, [])
  useEffect(() => {
    if (!unitId || !showValHistory) return
    api.unitValuations(unitId).then((r) => setSnapshots(r.snapshots)).catch(() => setSnapshots([]))
  }, [unitId, showValHistory, data])

  // contact typeahead for the offer form
  useEffect(() => {
    const needle = contactQuery.trim()
    if (needle.length < 2 || (buyer && needle === (buyer.name ?? ''))) {
      setContactHits([])
      return
    }
    const t = setTimeout(() => {
      api.searchContacts(needle).then((r) => setContactHits(r.contacts)).catch(() => setContactHits([]))
    }, 300)
    return () => clearTimeout(t)
  }, [contactQuery, buyer])

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label)
    setError('')
    try {
      await fn()
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy('')
    }
  }

  async function saveTaxonomy(e: FormEvent) {
    e.preventDefault()
    if (!unitId) return
    await run('taxonomy', () => api.assignTaxonomy(unitId, {
      category_id: taxCat || null,
      make_id: taxMake || null,
      model_id: taxModel || null,
    }))
    setEditTax(false)
  }

  async function addExpense(e: FormEvent) {
    e.preventDefault()
    if (!unitId || !expAmount || !expDate) return
    const cents = Math.round(parseFloat(expAmount) * 100)
    if (!Number.isFinite(cents) || cents <= 0) { setError('Expense amount must be a positive number'); return }
    await run('expense', () => api.addExpense(unitId, {
      category: expCategory,
      amount_cents: cents,
      incurred_on: expDate,
      note: expNote.trim() || undefined,
    }))
    setExpAmount(''); setExpDate(''); setExpNote('')
  }

  // 3c-4: running is explicit and writes nothing; saving redeems the run
  // token server-side, so the saved row is exactly what was reviewed.
  async function runValuation() {
    if (!unitId) return
    setBusy('val-run')
    setError('')
    try {
      setValRun(await api.runValuation(unitId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Valuation run failed')
    } finally {
      setBusy('')
    }
  }

  async function saveValuation() {
    if (!unitId || !valRun) return
    setBusy('val-save')
    setError('')
    try {
      await api.saveValuation(unitId, valRun.run_token)
      setValRun(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Snapshot save failed')
    } finally {
      setBusy('')
    }
  }

  async function confirmRelease() {
    if (!unitId || !releaseReason) return
    await run('release', () => api.transitionUnit(
      unitId, 'available', releaseNote.trim() || undefined, releaseReason))
    setReleaseOpen(false)
    setReleaseReason('')
    setReleaseNote('')
  }

  async function logOffer(e: FormEvent) {
    e.preventDefault()
    if (!unitId || !buyer || !offerAmount) return
    const cents = Math.round(parseFloat(offerAmount) * 100)
    if (!Number.isFinite(cents) || cents <= 0) { setError('Offer amount must be a positive number'); return }
    await run('offer', () => api.logOffer(unitId, {
      buyer_contact_id: buyer.id,
      amount_cents: cents,
      expires_at: offerExpiry ? new Date(offerExpiry + 'T17:00:00').toISOString() : undefined,
      note: offerNote.trim() || undefined,
    }))
    setBuyer(null); setContactQuery(''); setOfferAmount(''); setOfferExpiry(''); setOfferNote('')
  }

  if (loading) return <div className="admin-loading">Loading unit…</div>
  if (!data) return <div className="admin-loading">{error || 'Unit not found'}</div>

  const { unit, allowed_transitions, status_history, expenses, expense_total_cents, offers, tasks } = data
  const modelsForPicker = taxonomy?.models.filter((m) =>
    (!taxMake || m.make_id === taxMake) && (!taxCat || m.category_id === taxCat)) ?? []

  return (
    <div>
      <Link to="/inventory" className="back-link">← Back to inventory</Link>

      <div className="detail-grid">
        <div>
          <div className="panel">
            <h3>{unit.title}</h3>
            <div className="fieldrow">
              <span>Status</span>
              <span>
                <span className={`pill ${STATUS_PILL[unit.status]}`}>{statusPillText(unit)}</span>
                {unit.archived ? ' (archived)' : ''}
              </span>
            </div>
            <div className="fieldrow"><span>Year</span><span>{unit.year ?? '—'}</span></div>
            <div className="fieldrow"><span>Hours</span><span>{unit.hours !== null ? unit.hours.toLocaleString() : '—'}</span></div>
            <div className="fieldrow"><span>Serial</span><span>{unit.serial ?? '—'}</span></div>
            <div className="fieldrow"><span>Condition</span><span>{unit.condition ?? '—'}</span></div>
            <div className="fieldrow"><span>Location</span><span>{unit.location ?? '—'}</span></div>
            <div className="fieldrow"><span>Asking price</span><span>{money(unit.asking_price_cents)}</span></div>
            <div className="fieldrow"><span>Stock cost</span><span>{money(unit.stock_cost_cents)}</span></div>
            {unit.description && <div className="note" style={{ marginTop: 10 }}>{unit.description}</div>}
            {unit.legacy_source && (
              <div className="note">Imported from TAB listing {unit.legacy_id} · {when(unit.created_at)}</div>
            )}
          </div>

          <div className="panel">
            <h3>
              Valuation
              {unit.valuation?.revalue && <span className="revalue-badge">Revalue</span>}
            </h3>
            {unit.valuation ? (
              <>
                <div className="val-row">
                  <div><b>{moneyShort(unit.valuation.flv_cents)}</b><small>FLV</small></div>
                  <div><b>{moneyShort(unit.valuation.olv_cents)}</b><small>OLV</small></div>
                  <div><b>{moneyShort(unit.valuation.fmv_cents)}</b><small>FMV</small></div>
                </div>
                <div className="val-meta">
                  <span className={unit.valuation.stale ? 'stale' : undefined}>
                    Snapshot {snapshotAge(unit.valuation.age_days)}
                    {unit.valuation.stale ? ' · stale' : ''}
                  </span>
                  {' '}· Tier {unit.valuation.tier}
                  {unit.valuation.confidence !== null ? ` · ${Math.round(unit.valuation.confidence)}% conf` : ''}
                  {' '}· engine data {unit.valuation.engine_data_version}
                </div>
                {unit.valuation.revalue && (
                  <div className="note" style={{ color: '#B4432B' }}>
                    Hours or condition changed since this snapshot — run a new valuation.
                  </div>
                )}
              </>
            ) : (
              <div className="note">No valuation snapshot yet.</div>
            )}

            {!valRun ? (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="plat-btn" disabled={busy !== ''} onClick={runValuation}>
                  {busy === 'val-run' ? 'Running…' : 'Run valuation'}
                </button>
                <span className="note" style={{ margin: 0 }}>
                  Runs the Evaluator — nothing is saved until you save the snapshot.
                </span>
              </div>
            ) : (
              <div style={{ marginTop: 10, border: '1px solid var(--p-steel)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--p-navy-dark)' }}>
                  Engine result — review before saving
                </div>
                <div className="val-row">
                  <div><b>{moneyShort(valRun.flv_cents)}</b><small>FLV</small></div>
                  <div><b>{moneyShort(valRun.olv_cents)}</b><small>OLV</small></div>
                  <div><b>{moneyShort(valRun.fmv_cents)}</b><small>FMV</small></div>
                </div>
                <div className="val-meta">
                  Tier {valRun.tier}{valRun.tier_label ? ` (${valRun.tier_label})` : ''}
                  {valRun.confidence !== null ? ` · ${Math.round(valRun.confidence)}% conf` : ''}
                  {valRun.confidence_label ? ` (${valRun.confidence_label})` : ''}
                  {valRun.comp_count !== null ? ` · ${valRun.comp_count} comps` : ''}
                  {valRun.engine_data_version ? ` · engine data ${valRun.engine_data_version}` : ''}
                </div>
                <div className="val-meta">
                  As of {valRun.as_of.hours !== null ? `${valRun.as_of.hours.toLocaleString()} hr` : 'unknown hours'}
                  {' '}· condition {valRun.as_of.condition ?? 'unknown'}
                </div>
                {valRun.stale_comps_warning && (
                  <div className="note" style={{ color: '#B4432B' }}>Comps average older than 18 months.</div>
                )}
                {valRun.summary && <div className="note">{valRun.summary}</div>}
                {valRun.assumptions.length > 0 && (
                  <ul className="note" style={{ margin: '6px 0 0 16px' }}>
                    {valRun.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                )}
                {!valRun.saveable && valRun.save_block && (
                  <div className="note" style={{ color: '#B4432B', fontWeight: 'bold' }}>{valRun.save_block}</div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="plat-btn" disabled={busy !== '' || !valRun.saveable} onClick={saveValuation}>
                    {busy === 'val-save' ? 'Saving…' : 'Save snapshot'}
                  </button>
                  <button className="plat-btn ghost" disabled={busy !== ''} onClick={() => setValRun(null)}>
                    Discard
                  </button>
                </div>
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <button className="plat-btn ghost" onClick={() => setShowValHistory((s) => !s)}>
                {showValHistory ? 'Hide history' : 'Snapshot history'}
              </button>
              {showValHistory && (
                snapshots.length === 0 ? (
                  <div className="note" style={{ marginTop: 6 }}>No snapshots recorded.</div>
                ) : (
                  snapshots.map((s) => (
                    <div className="hist-item" key={s.id}>
                      <div>
                        <b>{moneyShort(s.flv_cents)}</b> FLV · <b>{moneyShort(s.olv_cents)}</b> OLV ·{' '}
                        <b>{moneyShort(s.fmv_cents)}</b> FMV · Tier {s.tier}
                        {s.confidence !== null ? ` · ${Math.round(s.confidence)}%` : ''}
                      </div>
                      <div className="when">
                        {when(s.taken_at)} · {s.taken_by_name ?? '—'}
                        {s.unit_hours !== null ? ` · at ${s.unit_hours.toLocaleString()} hr` : ''}
                        {s.unit_condition ? ` · ${s.unit_condition}` : ''} · {s.engine_data_version}
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>

          <div className="panel">
            <h3>
              Taxonomy
              {!editTax && (
                <button className="plat-btn ghost" style={{ marginLeft: 10 }} onClick={() => setEditTax(true)}>Edit</button>
              )}
            </h3>
            {!editTax ? (
              <>
                <div className="fieldrow"><span>Category</span><span>{unit.category_name ?? 'not linked'}</span></div>
                <div className="fieldrow"><span>Make</span><span>{unit.make_name ?? 'not linked'}</span></div>
                <div className="fieldrow"><span>Model</span><span>{unit.model_name ?? 'not linked'}</span></div>
                {(!unit.category_id || !unit.make_id || !unit.model_id) && (
                  <div className="note">TAB carried make/model as free text — assign the links here.</div>
                )}
              </>
            ) : (
              <form onSubmit={saveTaxonomy}>
                <select className="plat-input" value={taxCat} onChange={(e) => { setTaxCat(e.target.value); setTaxModel('') }}>
                  <option value="">No category</option>
                  {taxonomy?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="plat-input" value={taxMake} onChange={(e) => { setTaxMake(e.target.value); setTaxModel('') }}>
                  <option value="">No make</option>
                  {taxonomy?.makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <select className="plat-input" value={taxModel} onChange={(e) => setTaxModel(e.target.value)}>
                  <option value="">No model</option>
                  {modelsForPicker.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="plat-btn" type="submit" disabled={busy === 'taxonomy'}>
                    {busy === 'taxonomy' ? 'Saving…' : 'Save taxonomy'}
                  </button>
                  <button className="plat-btn ghost" type="button" onClick={() => setEditTax(false)}>Cancel</button>
                </div>
              </form>
            )}
          </div>

          <div className="panel">
            <h3>Offers</h3>
            {unit.status !== 'sold' && !unit.archived && (
              <form onSubmit={logOffer} style={{ marginBottom: 14 }}>
                <div style={{ position: 'relative' }}>
                  <input
                    className="plat-input"
                    placeholder="Buyer contact — type to search…"
                    value={contactQuery}
                    onChange={(e) => { setContactQuery(e.target.value); setBuyer(null) }}
                  />
                  {contactHits.length > 0 && !buyer && (
                    <div className="typeahead">
                      {contactHits.map((c) => (
                        <div key={c.id} className="typeahead-item" onClick={() => {
                          setBuyer(c)
                          setContactQuery(c.name ?? c.email ?? c.id)
                          setContactHits([])
                        }}>
                          <b>{c.name ?? '(no name)'}</b>
                          <span> {c.company_name ?? c.email ?? ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="plat-input"
                    style={{ flex: 1 }}
                    placeholder="Amount ($)"
                    inputMode="decimal"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                  />
                  <input
                    className="plat-input"
                    style={{ flex: 1 }}
                    type="date"
                    title="Expiry (default: 7 days)"
                    value={offerExpiry}
                    onChange={(e) => setOfferExpiry(e.target.value)}
                  />
                </div>
                <input
                  className="plat-input"
                  placeholder="Note (optional)"
                  value={offerNote}
                  onChange={(e) => setOfferNote(e.target.value)}
                />
                <button className="plat-btn" type="submit" disabled={busy === 'offer' || !buyer || !offerAmount}>
                  {busy === 'offer' ? 'Saving…' : 'Log offer'}
                </button>
                <span className="note" style={{ marginLeft: 10 }}>
                  Logging holds nothing — accepting is what reserves the unit.
                </span>
              </form>
            )}
            {offers.length === 0 ? (
              <div className="note">No offers logged on this unit.</div>
            ) : (
              offers.map((o) => (
                <div className="hist-item" key={o.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <b>{money(o.amount_cents)}</b>
                      <span className={`pill ${OFFER_PILL[o.status] ?? 'grey'}`} style={{ marginLeft: 8 }}>{OFFER_STATUS_LABEL[o.status] ?? o.status}</span>
                      <div className="when">
                        {o.buyer_name ?? 'Unknown buyer'}{o.buyer_company ? ` (${o.buyer_company})` : ''} ·
                        {' '}rep {o.rep_name ?? '—'} · expires {when(o.expires_at)}
                        {o.deal_name ? ` · deal ${o.deal_name}` : ''}
                      </div>
                      {o.note && <div className="when">{o.note}</div>}
                    </div>
                    {o.status === 'open' && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button className="plat-btn" disabled={busy !== ''} onClick={() => run('accept', () => api.acceptOffer(o.id))}>
                          Accept
                        </button>
                        <button className="plat-btn ghost" disabled={busy !== ''} onClick={() => run('decline', () => api.declineOffer(o.id))}>
                          Decline
                        </button>
                        <button className="plat-btn ghost" disabled={busy !== ''} onClick={() => run('withdraw', () => api.withdrawOffer(o.id))}>
                          Withdraw
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <h3>Status</h3>
            <div style={{ marginBottom: 10 }}>
              <span className={`pill ${STATUS_PILL[unit.status]}`}>{statusPillText(unit)}</span>
            </div>
            {allowed_transitions.length > 0 && (
              <>
                <input
                  className="plat-input"
                  placeholder="Transition note (required for some moves)"
                  value={transitionNote}
                  onChange={(e) => setTransitionNote(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {allowed_transitions.map((t) => (
                    <button
                      key={t}
                      className="plat-btn ghost"
                      disabled={busy !== ''}
                      onClick={() => {
                        if (unit.status === 'reserved' && t === 'available') {
                          // Releasing a reservation asks WHY (one choice) —
                          // the reason becomes the offer's terminal status.
                          setReleaseOpen((o) => !o)
                          return
                        }
                        run(t, () => api.transitionUnit(unit.id, t, transitionNote.trim() || undefined).then(() => setTransitionNote('')))
                      }}
                    >
                      {unit.status === 'reserved' && t === 'available'
                        ? 'Release reservation…' : (TRANSITION_LABEL[t] ?? t)}
                    </button>
                  ))}
                </div>
                {releaseOpen && unit.status === 'reserved' && (
                  <div style={{ border: '1px solid var(--p-steel)', borderRadius: 8, padding: '10px 12px', marginTop: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--p-navy-dark)', marginBottom: 6 }}>
                      Why is this reservation being released?
                    </div>
                    {RELEASE_CHOICES.map((c) => (
                      <label key={c.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 4 }}>
                        <input
                          type="radio"
                          name="release-reason"
                          checked={releaseReason === c.value}
                          onChange={() => setReleaseReason(c.value)}
                        />
                        {c.label}
                      </label>
                    ))}
                    <input
                      className="plat-input"
                      placeholder="Note (optional)"
                      value={releaseNote}
                      onChange={(e) => setReleaseNote(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="plat-btn" disabled={busy !== '' || !releaseReason} onClick={confirmRelease}>
                        {busy === 'release' ? 'Releasing…' : 'Release'}
                      </button>
                      <button className="plat-btn ghost" disabled={busy !== ''} onClick={() => { setReleaseOpen(false); setReleaseReason(''); setReleaseNote('') }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <div className="note">
                  Reserving is not a button — it happens only by accepting an offer.
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <h3>Status history</h3>
            {status_history.length === 0 ? (
              <div className="note">No status events.</div>
            ) : (
              status_history.map((h, i) => (
                <div className="hist-item" key={i}>
                  <div><b>{h.from_status ?? 'created'}</b> → <b>{h.to_status}</b>
                    {h.offer_amount_cents !== null && (
                      <span className="when"> · offer {money(h.offer_amount_cents)}</span>
                    )}
                  </div>
                  {h.note && <div style={{ margin: '2px 0' }}>{h.note}</div>}
                  <div className="when">{h.actor_name ?? 'System'} · {when(h.at)}</div>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <h3>Expenses {expenses.length > 0 && <span style={{ color: 'var(--p-navy-dark)' }}>· {money(expense_total_cents)}</span>}</h3>
            <form onSubmit={addExpense} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="plat-input" style={{ flex: 1 }} value={expCategory} onChange={(e) => setExpCategory(e.target.value)}>
                  {['transport', 'repair', 'inspection', 'storage', 'other'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  className="plat-input"
                  style={{ flex: 1 }}
                  placeholder="Amount ($)"
                  inputMode="decimal"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                />
              </div>
              <input className="plat-input" type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} />
              <input className="plat-input" placeholder="Note (optional)" value={expNote} onChange={(e) => setExpNote(e.target.value)} />
              <button className="plat-btn" type="submit" disabled={busy === 'expense' || !expAmount || !expDate}>
                {busy === 'expense' ? 'Saving…' : 'Add expense'}
              </button>
            </form>
            {expenses.length === 0 ? (
              <div className="note">No expenses recorded.</div>
            ) : (
              expenses.map((e) => (
                <div className="hist-item" key={e.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span><span className="pill grey">{e.category}</span>{e.note ? ` ${e.note}` : ''}</span>
                    <b>{money(e.amount_cents)}</b>
                  </div>
                  <div className="when">{dateOnly(e.incurred_on)} · {e.created_by_name ?? '—'}</div>
                </div>
              ))
            )}
          </div>

          {tasks.length > 0 && (
            <div className="panel">
              <h3>Tasks</h3>
              {tasks.map((t) => (
                <div className="hist-item" key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ textDecoration: t.done_at ? 'line-through' : undefined }}>{t.title}</div>
                    <div className="when">
                      {t.owner_name ?? '—'}
                      {t.due_at ? ` · due ${new Date(t.due_at).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  {!t.done_at && (
                    <button className="plat-btn ghost" disabled={busy !== ''} onClick={() => run('task', () => api.completeTask(t.id))}>
                      Done
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {error && <div className="note" style={{ color: '#B4432B', fontWeight: 'bold' }}>{error}</div>}
    </div>
  )
}
