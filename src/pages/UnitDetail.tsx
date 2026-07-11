import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type ContactHit, type TaxonomyLists, type UnitDetailResponse } from '../lib/api'
import { STATUS_PILL, money, statusPillText } from './Inventory'

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
}

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
                      <span className={`pill ${OFFER_PILL[o.status]}`} style={{ marginLeft: 8 }}>{o.status}</span>
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
                      onClick={() => run(t, () => api.transitionUnit(unit.id, t, transitionNote.trim() || undefined).then(() => setTransitionNote('')))}
                    >
                      {TRANSITION_LABEL[t] ?? t}
                    </button>
                  ))}
                </div>
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
