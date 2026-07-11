import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type DealDetailResponse } from '../lib/api'
import { DocumentsPanel } from '../components/DocumentsPanel'

function money(cents: number | null): string {
  if (cents === null) return '—'
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function DealDetail() {
  const { dealId } = useParams<{ dealId: string }>()
  const [data, setData] = useState<DealDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [actKind, setActKind] = useState<'note' | 'call'>('note')
  const [actSubject, setActSubject] = useState('')
  const [actBody, setActBody] = useState('')
  const [savingAct, setSavingAct] = useState(false)

  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [savingTask, setSavingTask] = useState(false)
  const [completingTask, setCompletingTask] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!dealId) return
    api.dealDetail(dealId)
      .then((res) => { setData(res); setError('') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load deal'))
      .finally(() => setLoading(false))
  }, [dealId])

  useEffect(() => { load() }, [load])

  async function submitActivity(e: FormEvent) {
    e.preventDefault()
    if (!dealId || !actBody.trim()) return
    setSavingAct(true)
    try {
      await api.logActivity(dealId, {
        kind: actKind,
        subject: actSubject.trim() || undefined,
        body: actBody.trim(),
      })
      setActSubject('')
      setActBody('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log activity')
    } finally {
      setSavingAct(false)
    }
  }

  async function submitTask(e: FormEvent) {
    e.preventDefault()
    if (!dealId || !taskTitle.trim()) return
    setSavingTask(true)
    try {
      await api.createTask({
        title: taskTitle.trim(),
        due_at: taskDue ? new Date(taskDue + 'T17:00:00').toISOString() : undefined,
        deal_id: dealId,
      })
      setTaskTitle('')
      setTaskDue('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setSavingTask(false)
    }
  }

  async function completeTask(taskId: string) {
    setCompletingTask(taskId)
    try {
      await api.completeTask(taskId)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete task')
    } finally {
      setCompletingTask(null)
    }
  }

  if (loading) return <div className="admin-loading">Loading deal…</div>
  if (!data) return <div className="admin-loading">{error || 'Deal not found'}</div>

  const { deal, stage_history, activities, tasks } = data

  return (
    <div>
      <Link to="/pipelines" className="back-link">← Back to pipelines</Link>

      <div className="detail-grid">
        <div>
          <div className="panel">
            <h3>{deal.name}</h3>
            <div className="fieldrow"><span>Pipeline / stage</span><span>{deal.pipeline_name} · {deal.stage_name}</span></div>
            <div className="fieldrow"><span>Value</span><span>{money(deal.value_cents)}</span></div>
            <div className="fieldrow"><span>Owner</span><span>{deal.owner_name ?? 'Unassigned'}</span></div>
            <div className="fieldrow"><span>Company</span><span>{deal.company_name ?? '—'}</span></div>
            <div className="fieldrow">
              <span>Contact</span>
              <span>
                {deal.contact_name ?? '—'}
                {deal.contact_email ? ` · ${deal.contact_email}` : ''}
              </span>
            </div>
            <div className="fieldrow"><span>Commission</span><span>{deal.commission_pct !== null ? `${deal.commission_pct}%` : 'not set'}</span></div>
            <div className="fieldrow"><span>Expected close</span><span>{deal.expected_close ? new Date(deal.expected_close).toLocaleDateString() : '—'}</span></div>
            {deal.outcome && (
              <div className="fieldrow">
                <span>Outcome</span>
                <span>
                  <span className={`pill ${deal.outcome === 'won' ? 'green' : 'red'}`}>{deal.outcome}</span>
                  {deal.lost_reason ? ` ${deal.lost_reason}` : ''}
                </span>
              </div>
            )}
            {deal.legacy_source && (
              <div className="note">Imported from HubSpot backfill · created {when(deal.created_at)}</div>
            )}
          </div>

          {dealId && <DocumentsPanel dealId={dealId} />}

          <div className="panel">
            <h3>Activity</h3>
            <form onSubmit={submitActivity} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div className="roletoggle">
                  <button type="button" className={actKind === 'note' ? 'active' : ''} onClick={() => setActKind('note')}>Note</button>
                  <button type="button" className={actKind === 'call' ? 'active' : ''} onClick={() => setActKind('call')}>Call</button>
                </div>
                <input
                  className="plat-input"
                  style={{ marginBottom: 0, flex: 1 }}
                  placeholder="Subject (optional)"
                  value={actSubject}
                  onChange={(e) => setActSubject(e.target.value)}
                />
              </div>
              <textarea
                className="plat-input"
                rows={3}
                placeholder={actKind === 'call' ? 'Call summary…' : 'Note…'}
                value={actBody}
                onChange={(e) => setActBody(e.target.value)}
              />
              <button className="plat-btn" type="submit" disabled={savingAct || !actBody.trim()}>
                {savingAct ? 'Saving…' : `Log ${actKind}`}
              </button>
            </form>
            {activities.length === 0 ? (
              <div className="note">No activity logged yet.</div>
            ) : (
              activities.map((a) => (
                <div className="hist-item" key={a.id}>
                  <div>
                    <span className={`pill ${a.kind === 'call' ? 'gold' : 'grey'}`}>{a.kind}</span>
                    {a.subject && <b style={{ marginLeft: 8 }}>{a.subject}</b>}
                  </div>
                  <div style={{ margin: '4px 0' }}>{a.body}</div>
                  <div className="when">{a.rep_name ?? 'Unknown'} · {when(a.occurred_at)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <h3>Stage history</h3>
            {stage_history.length === 0 ? (
              <div className="note">
                No stage moves recorded yet. History starts with the first move in this app —
                the backfill imported deals at their HubSpot stage.
              </div>
            ) : (
              stage_history.map((h, i) => (
                <div className="hist-item" key={i}>
                  <div><b>{h.from_stage ?? 'created'}</b> → <b>{h.to_stage}</b></div>
                  <div className="when">{h.actor_name ?? 'System'} · {when(h.at)}</div>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <h3>Tasks</h3>
            <form onSubmit={submitTask} style={{ marginBottom: 12 }}>
              <input
                className="plat-input"
                placeholder="New task for this deal…"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
              />
              <input
                className="plat-input"
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
              />
              <button className="plat-btn" type="submit" disabled={savingTask || !taskTitle.trim()}>
                {savingTask ? 'Saving…' : 'Add task'}
              </button>
            </form>
            {tasks.length === 0 ? (
              <div className="note">No tasks on this deal.</div>
            ) : (
              tasks.map((t) => (
                <div className="hist-item" key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ textDecoration: t.done_at ? 'line-through' : undefined }}>{t.title}</div>
                    <div className="when">
                      {t.owner_name ?? '—'}
                      {t.due_at ? ` · due ${new Date(t.due_at).toLocaleDateString()}` : ''}
                      {t.done_at ? ' · done' : ''}
                    </div>
                  </div>
                  {!t.done_at && (
                    <button
                      className="plat-btn ghost"
                      disabled={completingTask === t.id}
                      onClick={() => completeTask(t.id)}
                    >
                      {completingTask === t.id ? '…' : 'Done'}
                    </button>
                  )}
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
