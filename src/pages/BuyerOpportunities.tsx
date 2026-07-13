import { useCallback, useEffect, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  api, type BuyerBoardResponse, type BuyerOppCard, type ContactHit,
  type InterestStatus, type SearchResult,
} from '../lib/api'

// Buy opps board — the buy-side interest tracker (build step 4e + P1 usability).
// Its OWN pipeline (kind='buy'), teal accent. Attaching units is interest only
// and never changes unit status. All reps VIEW every opp; only owner/admin move.
// P1: default to Mine (mirrors the sell board), searchable unit picker on
// create, probability + timeframe, and item#/description on the card.

function initials(name: string | null): string {
  if (!name) return '—'
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

const INTEREST_OPTIONS: InterestStatus[] = ['info_sent', 'negotiating', 'cooling', 'offer_made']
const INTEREST_HINT = 'Buy-side only — nothing here touches unit availability or HubSpot.'

interface PickedUnit {
  unit_id: string
  title: string
  subtitle: string | null
  target_price_cents: number | null
  interest_status: InterestStatus
}

function unitCardLabel(card: BuyerOppCard): string | null {
  if (card.unit_count === 0 || !card.first_unit) return null
  const fu = card.first_unit
  const num = fu.legacy_id ? `#${fu.legacy_id}` : (fu.serial || 'no #')
  const desc = (fu.description || fu.title || '').trim()
  let s = `${num} — ${desc}`
  if (card.unit_count > 1) s += `  +${card.unit_count - 1} more`
  return s
}

function centsFromInput(v: string): number | null {
  const n = parseFloat(v.replace(/[^0-9.]/g, ''))
  return Number.isNaN(n) ? null : Math.round(n * 100)
}

export function BuyerOpportunities() {
  const navigate = useNavigate()
  const [board, setBoard] = useState<BuyerBoardResponse | null>(null)
  const [mine, setMine] = useState(true)   // P1: default to Mine
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  // create form
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<ContactHit[]>([])
  const [picked, setPicked] = useState<ContactHit | null>(null)
  const [notes, setNotes] = useState('')
  const [probability, setProbability] = useState('')
  const [expectedClose, setExpectedClose] = useState('')
  const [saving, setSaving] = useState(false)

  // unit picker
  const [uq, setUq] = useState('')
  const [uhits, setUhits] = useState<SearchResult[]>([])
  const [pickedUnits, setPickedUnits] = useState<PickedUnit[]>([])

  const load = useCallback((scopeMine: boolean) => {
    setLoading(true)
    api.buyerOpportunities({ mine: scopeMine })
      .then((res) => { setBoard(res); setError('') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(mine) }, [mine, load])

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return }
    let live = true
    api.searchContacts(q.trim())
      .then((res) => { if (live) setHits(res.contacts) })
      .catch(() => { if (live) setHits([]) })
    return () => { live = false }
  }, [q])

  useEffect(() => {
    if (uq.trim().length < 2) { setUhits([]); return }
    let live = true
    const t = setTimeout(() => {
      api.globalSearch(uq.trim())
        .then((res) => { if (live) setUhits(res.results.filter((r) => r.type === 'unit').slice(0, 8)) })
        .catch(() => { if (live) setUhits([]) })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [uq])

  function addUnit(h: SearchResult) {
    setPickedUnits((cur) => cur.some((u) => u.unit_id === h.id) ? cur
      : [...cur, { unit_id: h.id, title: h.title, subtitle: h.subtitle, target_price_cents: null, interest_status: 'info_sent' }])
    setUq(''); setUhits([])
  }

  function updateUnit(unitId: string, patch: Partial<PickedUnit>) {
    setPickedUnits((cur) => cur.map((u) => (u.unit_id === unitId ? { ...u, ...patch } : u)))
  }

  function onDragStart(e: DragEvent, id: string) {
    e.dataTransfer.setData('text/opp-id', id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(id)
  }

  async function onDrop(e: DragEvent, stageId: string) {
    e.preventDefault()
    setDragOverStage(null)
    const id = e.dataTransfer.getData('text/opp-id')
    setDraggingId(null)
    if (!id || !board) return
    const opp = board.opportunities.find((o) => o.id === id)
    if (!opp || opp.stage_id === stageId) return
    const previous = board
    setBoard({ ...board, opportunities: board.opportunities.map((o) => (o.id === id ? { ...o, stage_id: stageId } : o)) })
    try {
      await api.moveBuyerOpportunity(id, stageId)
    } catch (err) {
      setBoard(previous)
      setError(err instanceof Error ? err.message : 'Stage move failed')
    }
  }

  async function createOpp() {
    if (!picked) return
    setSaving(true)
    try {
      const prob = probability.trim() === '' ? null : parseInt(probability, 10)
      const res = await api.createBuyerOpportunity({
        buyer_contact_id: picked.id,
        notes: notes.trim() || undefined,
        probability_to_close: prob !== null && !Number.isNaN(prob) ? prob : null,
        expected_close: expectedClose || null,
        units: pickedUnits.map((u) => ({
          unit_id: u.unit_id,
          target_price_cents: u.target_price_cents,
          interest_status: u.interest_status,
        })),
      })
      navigate(`/buyer-opportunities/${res.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create opportunity')
      setSaving(false)
    }
  }

  if (error && !board) return <div className="admin-loading">{error}</div>
  if (!board) return <div className="admin-loading">Loading buy opps…</div>

  return (
    <div>
      <div className="panel" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="roletoggle buy">
            <button className={mine ? 'active' : ''} onClick={() => setMine(true)}>Mine</button>
            <button className={!mine ? 'active' : ''} onClick={() => setMine(false)}>All reps</button>
          </div>
          <button className="plat-btn" onClick={() => setCreating((c) => !c)}>
            {creating ? 'Cancel' : '+ New buy opp'}
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--p-body)' }}>{INTEREST_HINT}</span>
        </div>

        {creating && (
          <div style={{ border: '1px solid var(--p-steel)', borderRadius: 8, padding: '12px 14px', marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--p-navy-dark)', marginBottom: 8 }}>
              New buy opp — who is the buyer?
            </div>
            {picked ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="pill buy">{picked.name ?? 'Contact'}</span>
                {picked.company_name && <span style={{ fontSize: 12, color: 'var(--p-body)' }}>{picked.company_name}</span>}
                <button className="plat-btn ghost" onClick={() => { setPicked(null); setQ('') }}>Change</button>
              </div>
            ) : (
              <>
                <input
                  className="plat-input"
                  placeholder="Search a buyer contact by name / email…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {hits.length > 0 && (
                  <div style={{ border: '1px solid var(--p-steel)', borderRadius: 6, marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
                    {hits.map((h) => (
                      <div
                        key={h.id}
                        onClick={() => { setPicked(h); setHits([]) }}
                        style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--p-row)' }}
                      >
                        <b>{h.name ?? 'Unnamed'}</b>
                        {h.company_name ? ` · ${h.company_name}` : ''}
                        {h.email ? <span style={{ color: 'var(--p-body)' }}> · {h.email}</span> : null}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Probability + timeframe */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <label style={{ flex: '1 1 150px', fontSize: 12, color: 'var(--p-body)' }}>
                Probability to close (%)
                <input className="plat-input" type="number" min="0" max="100" step="1" placeholder="optional"
                       value={probability} onChange={(e) => setProbability(e.target.value)} />
              </label>
              <label style={{ flex: '1 1 160px', fontSize: 12, color: 'var(--p-body)' }}>
                Timeframe (expected close)
                <input className="plat-input" type="date"
                       value={expectedClose} onChange={(e) => setExpectedClose(e.target.value)} />
              </label>
            </div>

            {/* Unit picker */}
            <div style={{ fontSize: 12, color: 'var(--p-body)', marginTop: 6 }}>Units they're interested in (optional)</div>
            <input
              className="plat-input"
              placeholder="Search by item # (TAB listing), serial, or description…"
              value={uq}
              onChange={(e) => setUq(e.target.value)}
            />
            {uhits.length > 0 && (
              <div style={{ border: '1px solid var(--p-steel)', borderRadius: 6, marginTop: 6, maxHeight: 160, overflowY: 'auto' }}>
                {uhits.map((h) => (
                  <div key={h.id} onClick={() => addUnit(h)}
                       style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--p-row)' }}>
                    <b>{h.title}</b>{h.subtitle ? <span style={{ color: 'var(--p-body)' }}> · {h.subtitle}</span> : null}
                  </div>
                ))}
              </div>
            )}
            {pickedUnits.map((u) => (
              <div key={u.unit_id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6, padding: '6px 8px', border: '1px solid var(--p-row)', borderRadius: 6 }}>
                <b style={{ flex: '1 1 160px', fontSize: 13 }}>{u.title}</b>
                <input className="plat-input" style={{ marginBottom: 0, width: 130 }} placeholder="Target $"
                       onChange={(e) => updateUnit(u.unit_id, { target_price_cents: centsFromInput(e.target.value) })} />
                <select className="plat-input" style={{ marginBottom: 0, width: 'auto' }} value={u.interest_status}
                        onChange={(e) => updateUnit(u.unit_id, { interest_status: e.target.value as InterestStatus })}>
                  {INTEREST_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                <button className="plat-btn ghost" onClick={() => setPickedUnits((cur) => cur.filter((x) => x.unit_id !== u.unit_id))}>Remove</button>
              </div>
            ))}

            <textarea
              className="plat-input"
              placeholder="Notes (optional) — what are they hunting for?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ marginTop: 8, minHeight: 60, resize: 'vertical' }}
            />
            <div style={{ marginTop: 8 }}>
              <button className="plat-btn" disabled={!picked || saving} onClick={createOpp}>
                {saving ? 'Creating…' : 'Create buy opp'}
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="admin-loading">Loading buy opps…</div>
      ) : (
        <div className="board buy-board">
          {board.pipeline.stages.map((stage) => {
            const inColumn = board.opportunities.filter((o) => o.stage_id === stage.id)
            return (
              <div
                key={stage.id}
                className={`col${dragOverStage === stage.id ? ' drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.id) }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => onDrop(e, stage.id)}
              >
                <div className="colh">
                  <span>{stage.name}</span>
                  <span className="c">{inColumn.length}</span>
                </div>
                <div className="colb">
                  {inColumn.map((opp: BuyerOppCard) => {
                    const label = unitCardLabel(opp)
                    return (
                    <div
                      key={opp.id}
                      className={`card buy${draggingId === opp.id ? ' dragging' : ''}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, opp.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => navigate(`/buyer-opportunities/${opp.id}`)}
                    >
                      <div className="co">{opp.buyer_company ?? opp.buyer_name ?? 'Buyer'}</div>
                      <div className="eq">{opp.name}</div>
                      {label && <div className="when" style={{ marginTop: 2 }}>{label}</div>}
                      <div className="mt">
                        <span className="vv">
                          {opp.probability_to_close !== null ? `${opp.probability_to_close}%` : `${opp.unit_count} unit${opp.unit_count === 1 ? '' : 's'}`}
                        </span>
                        <span className="rp" title={opp.owner_name ?? 'Unassigned'}>{initials(opp.owner_name)}</span>
                      </div>
                      {opp.expected_close && (
                        <div className="when" style={{ marginTop: 2 }}>Close ~ {new Date(opp.expected_close).toLocaleDateString()}</div>
                      )}
                    </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      <div className="note">
        Drag a card to move its buy-side stage (only your own, or as an admin). Each card is a
        buyer you're working — open one to manage the units they're interested in.
      </div>
    </div>
  )
}
