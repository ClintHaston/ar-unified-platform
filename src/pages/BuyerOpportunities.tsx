import { useCallback, useEffect, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type BuyerBoardResponse, type BuyerOppCard, type ContactHit } from '../lib/api'

// Buyer opportunities board — the buy-side interest tracker (build step 4e).
// Its OWN pipeline (kind='buy'), visually distinct from the gold sell-side
// board (teal accent). Attaching units to an opportunity is interest only and
// never changes unit status; reservation stays the offer flow's job. All reps
// can VIEW every opportunity; only the owner (or an admin) can move one.

function initials(name: string | null): string {
  if (!name) return '—'
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

const INTEREST_HINT = 'Buy-side only — nothing here touches unit availability or HubSpot.'

export function BuyerOpportunities() {
  const navigate = useNavigate()
  const [board, setBoard] = useState<BuyerBoardResponse | null>(null)
  const [mine, setMine] = useState(false)
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
  const [saving, setSaving] = useState(false)

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
      const res = await api.createBuyerOpportunity({
        buyer_contact_id: picked.id,
        notes: notes.trim() || undefined,
      })
      navigate(`/buyer-opportunities/${res.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create opportunity')
      setSaving(false)
    }
  }

  if (error && !board) return <div className="admin-loading">{error}</div>
  if (!board) return <div className="admin-loading">Loading buyer opportunities…</div>

  return (
    <div>
      <div className="panel" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="roletoggle buy">
            <button className={!mine ? 'active' : ''} onClick={() => setMine(false)}>All reps</button>
            <button className={mine ? 'active' : ''} onClick={() => setMine(true)}>Mine</button>
          </div>
          <button className="plat-btn" onClick={() => setCreating((c) => !c)}>
            {creating ? 'Cancel' : '+ New buyer opportunity'}
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--p-body)' }}>{INTEREST_HINT}</span>
        </div>

        {creating && (
          <div style={{ border: '1px solid var(--p-steel)', borderRadius: 8, padding: '12px 14px', marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--p-navy-dark)', marginBottom: 8 }}>
              New buyer opportunity — who is the buyer?
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
            <textarea
              className="plat-input"
              placeholder="Notes (optional) — what are they hunting for?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ marginTop: 8, minHeight: 60, resize: 'vertical' }}
            />
            <div style={{ marginTop: 8 }}>
              <button className="plat-btn" disabled={!picked || saving} onClick={createOpp}>
                {saving ? 'Creating…' : 'Create opportunity'}
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="admin-loading">Loading buyer opportunities…</div>
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
                  {inColumn.map((opp: BuyerOppCard) => (
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
                      <div className="mt">
                        <span className="vv">{opp.unit_count} unit{opp.unit_count === 1 ? '' : 's'}</span>
                        <span className="rp" title={opp.owner_name ?? 'Unassigned'}>{initials(opp.owner_name)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      <div className="note">
        Drag a card to move its buy-side stage (only your own, or as an admin). Each card is a
        buyer you're working — open one to attach the units they're interested in.
      </div>
    </div>
  )
}
