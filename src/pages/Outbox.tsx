import { useCallback, useEffect, useState } from 'react'
import {
  api,
  type OutboxDryRunReport,
  type OutboxPlan,
  type OutboxResponse,
  type OutboxRow,
  type OutboxStatus,
} from '../lib/api'

// Admin Outbox screen (build step 4b, productization section C): the §5
// "failures visible and retryable" surface. Tabs over the queue; row
// detail shows last_error and exactly what the drain would write (the
// 4a planner, reused verbatim); retry on failed rows; approve/dismiss on
// gated first-push rows. Every action writes an audit row server-side.

type Tab = 'pending' | 'pending_approval' | 'failed'

const TABS: Array<{ key: Tab; label: string; countKey: 'pending' | 'gated' | 'failed' }> = [
  { key: 'pending', label: 'Pending', countKey: 'pending' },
  { key: 'pending_approval', label: 'Gated (first push)', countKey: 'gated' },
  { key: 'failed', label: 'Failed', countKey: 'failed' },
]

const OP_LABEL: Record<string, string> = {
  upsert: 'Upsert',
  archive: 'Archive',
  associate: 'Associate',
}

const ACTION_LABEL: Record<string, string> = {
  create: 'would CREATE in HubSpot',
  update: 'would UPDATE the mirrored record',
  archive: 'would ARCHIVE the mirrored record',
  associate: 'would ASSOCIATE the two mirrored records',
  held_for_approval: 'held at the first-push approval gate',
  waiting_on_parents: 'waiting — both ends must be mapped first',
  waiting_on_gate: 'waiting — a parent is held at the approval gate',
  config_error: 'configuration gap',
  done_nothing_to_archive: 'nothing to do — never pushed, no mirror object',
  done_entity_missing: 'nothing to do — entity row no longer exists',
  done_archived_before_first_push: 'nothing to do — archived before first push',
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function PlanDetail({ plan }: { plan: OutboxPlan }) {
  return (
    <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.03)', borderRadius: 6 }}>
      <div><b>{ACTION_LABEL[plan.action] ?? plan.action}</b></div>
      {plan.hubspot_id && (
        <div className="note">HubSpot id: <code>{plan.hubspot_id}</code></div>
      )}
      {plan.note && <div className="note">{plan.note}</div>}
      {plan.properties && (
        <table className="plat-table" style={{ marginTop: 8, maxWidth: 560 }}>
          <tbody>
            {Object.entries(plan.properties).map(([k, v]) => (
              <tr key={k}>
                <td style={{ width: 180 }}><code>{k}</code></td>
                <td>{v === '' ? <i className="note">(cleared)</i> : v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {plan.intended_lifecyclestage && (
        <div className="note" style={{ marginTop: 6 }}>
          Lifecycle stamp intended: <b>{plan.intended_lifecyclestage}</b>
          {plan.ratchet_note ? ` — ${plan.ratchet_note}` : ''}
        </div>
      )}
    </div>
  )
}

export function Outbox() {
  const [tab, setTab] = useState<Tab>('pending')
  const [data, setData] = useState<OutboxResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [plans, setPlans] = useState<Record<string, OutboxPlan | 'loading'>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [dryRun, setDryRun] = useState<OutboxDryRunReport | null>(null)
  const [dryRunning, setDryRunning] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.outbox(tab as OutboxStatus)
      .then((res) => { setData(res); setError('') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load outbox'))
      .finally(() => setLoading(false))
  }, [tab])

  useEffect(() => { setOpenRow(null); load() }, [load])

  async function toggleRow(row: OutboxRow) {
    if (openRow === row.id) { setOpenRow(null); return }
    setOpenRow(row.id)
    if (!plans[row.id]) {
      setPlans((p) => ({ ...p, [row.id]: 'loading' }))
      try {
        const plan = await api.outboxPlan(row.id)
        setPlans((p) => ({ ...p, [row.id]: plan }))
      } catch {
        setPlans((p) => {
          const { [row.id]: _dropped, ...rest } = p
          return rest
        })
      }
    }
  }

  async function act(row: OutboxRow, action: 'retry' | 'approve' | 'dismiss') {
    setBusy(row.id)
    setError('')
    try {
      if (action === 'retry') await api.retryOutboxRow(row.id)
      if (action === 'approve') await api.approveOutboxRow(row.id)
      if (action === 'dismiss') await api.dismissOutboxRow(row.id)
      setPlans((p) => {
        const { [row.id]: _dropped, ...rest } = p
        return rest
      })
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  async function runDryRun() {
    setDryRunning(true)
    setError('')
    try {
      setDryRun(await api.outboxDryRun())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dry run failed')
    } finally {
      setDryRunning(false)
    }
  }

  if (loading && !data) return <div className="admin-loading">Loading outbox…</div>

  return (
    <div>
      <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span className={`pill ${data?.drain_armed ? 'red' : 'grey'}`}>
          {data?.drain_armed ? 'DRAIN ARMED — writes to HubSpot' : 'Drain disarmed'}
        </span>
        <span className="note" style={{ marginTop: 0 }}>
          {data?.drain_armed
            ? 'The drain pushes this queue to HubSpot every 10 minutes.'
            : 'Queue accumulates by design until cutover — nothing is pushed while disarmed.'}
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn-primary" onClick={runDryRun} disabled={dryRunning}>
          {dryRunning ? 'Planning…' : 'Run dry-run (zero writes)'}
        </button>
      </div>

      {dryRun && (
        <div className="panel" data-testid="dryrun-summary">
          <b>Dry run:</b>{' '}
          {Object.entries(dryRun.planned).length === 0
            ? 'queue is empty — nothing would be written.'
            : Object.entries(dryRun.planned).map(([k, v]) => `${v} ${k}`).join(' · ')}
          <div className="note">
            HubSpot writes performed: <b>{dryRun.hubspot_writes_performed}</b> — reads only,
            the queue was not mutated.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className="btn-primary"
            style={tab === t.key ? undefined : { background: 'transparent', color: 'var(--p-navy-mid)', border: '1px solid var(--p-navy-mid)' }}
            onClick={() => setTab(t.key)}
          >
            {t.label} ({data?.queue[t.countKey] ?? 0})
          </button>
        ))}
      </div>

      {error && <div className="note" style={{ color: '#B4432B', marginBottom: 8 }}>{error}</div>}

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="plat-table">
          <thead>
            <tr>
              <th>Record</th><th>Type</th><th>Op</th><th>Attempts</th>
              <th>Queued</th><th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--p-body)', padding: 18 }}>
                  {tab === 'failed'
                    ? 'No failed rows — the floor is clean.'
                    : tab === 'pending_approval'
                      ? 'No first-push approvals waiting.'
                      : 'Nothing pending.'}
                </td>
              </tr>
            ) : (
              (data?.rows ?? []).map((row) => (
                <>
                  <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => toggleRow(row)}>
                    <td>
                      <b>{row.entity_label ?? row.entity_id.slice(0, 8)}</b>
                      {row.op === 'associate' && row.assoc_target_label && (
                        <span className="note"> → {row.assoc_target_type} {row.assoc_target_label}</span>
                      )}
                    </td>
                    <td>{row.entity_type}</td>
                    <td>{OP_LABEL[row.op] ?? row.op}</td>
                    <td className="num">{row.attempts}</td>
                    <td className="note">{when(row.created_at)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {row.status === 'failed' && (
                        <button className="btn-primary" disabled={busy === row.id}
                                onClick={() => act(row, 'retry')}>
                          {busy === row.id ? '…' : 'Retry'}
                        </button>
                      )}
                      {row.status === 'pending_approval' && (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="btn-primary" disabled={busy === row.id}
                                  onClick={() => act(row, 'approve')}>
                            {busy === row.id ? '…' : 'Approve'}
                          </button>
                          <button className="btn-primary" disabled={busy === row.id}
                                  style={{ background: '#8a8f98' }}
                                  onClick={() => act(row, 'dismiss')}>
                            Dismiss
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                  {openRow === row.id && (
                    <tr key={`${row.id}-detail`}>
                      <td colSpan={6} style={{ background: 'rgba(0,0,0,0.015)' }}>
                        {row.last_error && (
                          <div className="note" style={{ color: '#B4432B', marginBottom: 8 }}>
                            Last error: {row.last_error}
                          </div>
                        )}
                        {plans[row.id] === 'loading' || !plans[row.id]
                          ? <div className="note">Planning…</div>
                          : <PlanDetail plan={plans[row.id] as OutboxPlan} />}
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="note">
        Gated rows are first pushes of scraper/form-import contacts (§5). Approve releases the
        row to the drain; Dismiss keeps the contact local-only — a later edit re-enters the gate.
        Dismissed and completed rows leave this screen; every action is recorded in the audit log.
      </div>
    </div>
  )
}
