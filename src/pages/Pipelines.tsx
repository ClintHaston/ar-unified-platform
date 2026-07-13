import { useCallback, useEffect, useState, type DragEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, type DealCard, type DealScope, type Pipeline } from '../lib/api'
import { NewDealForm } from '../components/NewDealForm'

// Pipelines board per prototype_4: switcher, stage columns with counts,
// gold-accent deal cards. Drag-and-drop stage moves POST to the backend,
// which writes deal_stage_events with actor attribution. Postgres-local
// only (Amendment 14): nothing mirrors to HubSpot yet.

function money(cents: number | null): string {
  if (cents === null) return '—'
  const dollars = cents / 100
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}K`
  return `$${Math.round(dollars)}`
}

function initials(name: string | null): string {
  if (!name) return '—'
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

export function Pipelines() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [deals, setDeals] = useState<DealCard[]>([])
  const [scope, setScope] = useState<DealScope>('mine')
  const [creating, setCreating] = useState(searchParams.get('new') === '1')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  useEffect(() => {
    api.pipelines()
      .then((res) => {
        // Sell-side only — buy-side lives on its own Buyer opportunities board.
        const sell = res.pipelines.filter((p) => p.kind !== 'buy')
        setPipelines(sell)
        if (sell.length > 0) setActiveId(sell[0].id)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load pipelines'))
  }, [])

  const loadDeals = useCallback((pipelineId: string, dealScope: DealScope) => {
    setLoading(true)
    api.pipelineDeals(pipelineId, dealScope)
      .then((res) => { setDeals(res.deals); setError('') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load deals'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (activeId) loadDeals(activeId, scope)
  }, [activeId, scope, loadDeals])

  function openCreate() {
    setCreating(true)
  }

  function closeCreate() {
    setCreating(false)
    if (searchParams.get('new')) {
      searchParams.delete('new')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const active = pipelines.find((p) => p.id === activeId)

  function onDragStart(e: DragEvent, dealId: string) {
    e.dataTransfer.setData('text/deal-id', dealId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(dealId)
  }

  async function onDrop(e: DragEvent, stageId: string) {
    e.preventDefault()
    setDragOverStage(null)
    const dealId = e.dataTransfer.getData('text/deal-id')
    setDraggingId(null)
    if (!dealId) return
    const deal = deals.find((d) => d.id === dealId)
    if (!deal || deal.stage_id === stageId) return
    const previous = deals
    // optimistic move; revert on failure
    setDeals(previous.map((d) => (d.id === dealId ? { ...d, stage_id: stageId } : d)))
    try {
      await api.moveDeal(dealId, stageId)
    } catch (err) {
      setDeals(previous)
      setError(err instanceof Error ? err.message : 'Stage move failed')
    }
  }

  if (error && pipelines.length === 0) return <div className="admin-loading">{error}</div>
  if (!active) return <div className="admin-loading">Loading pipelines…</div>

  return (
    <div>
      <div className="panel" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--p-body)' }}>Pipeline:</span>
          <div className="roletoggle">
            {pipelines.map((p) => (
              <button
                key={p.id}
                className={p.id === activeId ? 'active' : ''}
                onClick={() => setActiveId(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="roletoggle">
            <button className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>Mine</button>
            <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>All</button>
          </div>
          <button className="plat-btn" onClick={() => (creating ? closeCreate() : openCreate())}>
            {creating ? 'Cancel' : '+ New deal'}
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--p-body)' }}>
            Changes are Postgres-local — nothing mirrors to HubSpot until the outbox ships
          </span>
        </div>

        {creating && (
          <NewDealForm
            onCreated={(dealId) => navigate(`/deals/${dealId}`)}
            onCancel={closeCreate}
          />
        )}
      </div>

      {loading ? (
        <div className="admin-loading">Loading deals…</div>
      ) : (
        <div className="board">
          {active.stages.map((stage) => {
            const inColumn = deals.filter((d) => d.stage_id === stage.id)
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
                  {inColumn.map((deal) => (
                    <div
                      key={deal.id}
                      className={`card${draggingId === deal.id ? ' dragging' : ''}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, deal.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => navigate(`/deals/${deal.id}`)}
                    >
                      <div className="co">{deal.company_name ?? 'No company'}</div>
                      <div className="eq">{deal.name}</div>
                      <div className="mt">
                        <span className="vv">{money(deal.value_cents)}</span>
                        <span className="rp" title={deal.owner_name ?? 'Unassigned'}>
                          {initials(deal.owner_name)}
                        </span>
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
        Cards are the real backfilled deals in Postgres. Drag a card to move its stage —
        every move writes deal_stage_events with your name on it.
      </div>
    </div>
  )
}
