import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  api,
  type ContactHit,
  type DealDetailResponse,
  type DealPatchInput,
  type OwnerOption,
  type Stage,
} from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { DocumentsPanel } from '../components/DocumentsPanel'
import { TabListingPanel } from '../components/TabListingPanel'

function money(cents: number | null): string {
  if (cents === null) return '—'
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const AUDIT_LABEL: Record<string, string> = {
  created: 'created', deal_edited: 'edited', stage_moved: 'stage',
}

export function DealDetail() {
  const { dealId } = useParams<{ dealId: string }>()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [data, setData] = useState<DealDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // edit mode
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [eName, setEName] = useState('')
  const [eStageId, setEStageId] = useState('')
  const [eValue, setEValue] = useState('')
  const [eCommission, setECommission] = useState('')
  const [eClose, setEClose] = useState('')
  const [eOwnerId, setEOwnerId] = useState('')
  const [eContactId, setEContactId] = useState<string | null>(null)
  const [eContactLabel, setEContactLabel] = useState<string | null>(null)
  const [changingContact, setChangingContact] = useState(false)
  const [cq, setCq] = useState('')
  const [chits, setChits] = useState<ContactHit[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [owners, setOwners] = useState<OwnerOption[]>([])

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

  useEffect(() => {
    if (cq.trim().length < 2) { setChits([]); return }
    let live = true
    api.searchContacts(cq.trim())
      .then((res) => { if (live) setChits(res.contacts) })
      .catch(() => { if (live) setChits([]) })
    return () => { live = false }
  }, [cq])

  async function enterEdit() {
    if (!data) return
    const { deal } = data
    setEName(deal.name)
    setEStageId(deal.stage_id)
    setEValue(deal.value_cents !== null ? String(deal.value_cents / 100) : '')
    setECommission(deal.commission_pct !== null ? String(deal.commission_pct) : '')
    setEClose(deal.expected_close ? deal.expected_close.slice(0, 10) : '')
    setEOwnerId(deal.owner_id ?? '')
    setEContactId(deal.contact_id ?? null)
    setEContactLabel(deal.contact_name)
    setChangingContact(false)
    setCq('')
    setEditing(true)
    // Load the pipeline's stages for the dropdown (and owners for admins).
    api.pipelines()
      .then((res) => {
        const p = res.pipelines.find((pp) => pp.id === deal.pipeline_id)
        setStages(p?.stages ?? [])
      })
      .catch(() => setStages([]))
    if (isAdmin) {
      api.contactOwners().then((res) => setOwners(res.owners.filter((o) => o.is_active))).catch(() => setOwners([]))
    }
  }

  async function saveEdit() {
    if (!dealId || !data) return
    const { deal } = data
    const patch: DealPatchInput = {}

    const name = eName.trim()
    if (name && name !== deal.name) patch.name = name
    if (eStageId && eStageId !== deal.stage_id) patch.to_stage_id = eStageId

    const cents = eValue.trim() === '' ? null : Math.round(parseFloat(eValue) * 100)
    const normCents = cents !== null && Number.isNaN(cents) ? deal.value_cents : cents
    if (normCents !== deal.value_cents) patch.value_cents = normCents

    const pct = eCommission.trim() === '' ? null : parseFloat(eCommission)
    const normPct = pct !== null && Number.isNaN(pct) ? deal.commission_pct : pct
    if (normPct !== deal.commission_pct) patch.commission_pct = normPct

    const close = eClose || null
    const curClose = deal.expected_close ? deal.expected_close.slice(0, 10) : null
    if (close !== curClose) patch.expected_close = close

    if (isAdmin) {
      const curOwner = deal.owner_id ?? ''
      if (eOwnerId !== curOwner) patch.owner_id = eOwnerId || null
    }

    if ((eContactId ?? null) !== (deal.contact_id ?? null)) patch.contact_id = eContactId

    if (Object.keys(patch).length === 0) { setEditing(false); return }

    setSavingEdit(true)
    try {
      await api.patchDeal(dealId, patch)
      setEditing(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save deal')
    } finally {
      setSavingEdit(false)
    }
  }

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

  const { deal, stage_history, timeline, tasks } = data

  return (
    <div>
      <Link to="/pipelines" className="back-link">← Back to pipelines</Link>

      <div className="detail-grid">
        <div>
          <div className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <h3 style={{ margin: 0 }}>{deal.name}</h3>
              {!editing && (
                <button className="plat-btn ghost" onClick={enterEdit}>Edit</button>
              )}
            </div>

            {editing ? (
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--p-body)' }}>
                  Deal name
                  <input className="plat-input" value={eName} onChange={(e) => setEName(e.target.value)} />
                </label>
                <label style={{ fontSize: 12, color: 'var(--p-body)' }}>
                  Stage
                  <select className="plat-input" value={eStageId} onChange={(e) => setEStageId(e.target.value)}>
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ flex: '1 1 140px', fontSize: 12, color: 'var(--p-body)' }}>
                    Value ($)
                    <input className="plat-input" type="number" min="0" step="1"
                           value={eValue} onChange={(e) => setEValue(e.target.value)} />
                  </label>
                  <label style={{ flex: '1 1 120px', fontSize: 12, color: 'var(--p-body)' }}>
                    Commission (%)
                    <input className="plat-input" type="number" min="0" max="100" step="0.1"
                           value={eCommission} onChange={(e) => setECommission(e.target.value)} />
                  </label>
                  <label style={{ flex: '1 1 160px', fontSize: 12, color: 'var(--p-body)' }}>
                    Expected close
                    <input className="plat-input" type="date"
                           value={eClose} onChange={(e) => setEClose(e.target.value)} />
                  </label>
                </div>

                <div style={{ fontSize: 12, color: 'var(--p-body)' }}>Contact</div>
                {!changingContact ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span className="pill grey">{eContactLabel ?? 'None'}</span>
                    <button className="plat-btn ghost" onClick={() => { setChangingContact(true); setCq('') }}>Change</button>
                    {eContactId && (
                      <button className="plat-btn ghost" onClick={() => { setEContactId(null); setEContactLabel(null) }}>Remove</button>
                    )}
                  </div>
                ) : (
                  <>
                    <input className="plat-input" placeholder="Search a contact…" value={cq} onChange={(e) => setCq(e.target.value)} />
                    {chits.length > 0 && (
                      <div style={{ border: '1px solid var(--p-steel)', borderRadius: 6, marginTop: 6, maxHeight: 160, overflowY: 'auto' }}>
                        {chits.map((h) => (
                          <div key={h.id}
                               onClick={() => { setEContactId(h.id); setEContactLabel(h.name); setChangingContact(false); setChits([]) }}
                               style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--p-row)' }}>
                            <b>{h.name ?? 'Unnamed'}</b>{h.company_name ? ` · ${h.company_name}` : ''}
                            {h.email ? <span style={{ color: 'var(--p-body)' }}> · {h.email}</span> : null}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="note" style={{ marginTop: 4 }}>Company follows the contact.</div>
                  </>
                )}

                {isAdmin && (
                  <label style={{ fontSize: 12, color: 'var(--p-body)' }}>
                    Owner
                    <select className="plat-input" value={eOwnerId} onChange={(e) => setEOwnerId(e.target.value)}>
                      <option value="">Unassigned</option>
                      {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </label>
                )}

                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button className="plat-btn" disabled={savingEdit || !eName.trim()} onClick={saveEdit}>
                    {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                  <button className="plat-btn ghost" disabled={savingEdit} onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>

          {dealId && <TabListingPanel dealId={dealId} />}

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
            {timeline.length === 0 ? (
              <div className="note">No activity logged yet.</div>
            ) : (
              timeline.map((t, i) => (
                <div className="hist-item" key={i}>
                  {t.type === 'activity' ? (
                    <>
                      <div>
                        <span className={`pill ${t.kind === 'call' ? 'gold' : 'grey'}`}>{t.kind}</span>
                        {t.subject && <b style={{ marginLeft: 8 }}>{t.subject}</b>}
                      </div>
                      <div style={{ margin: '4px 0' }}>{t.body}</div>
                      <div className="when">{t.actor_name ?? 'Unknown'} · {when(t.at)}</div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="pill grey">{AUDIT_LABEL[t.kind] ?? t.kind}</span>
                        <span style={{ marginLeft: 8 }}>{t.summary}</span>
                      </div>
                      <div className="when">{t.actor_name ?? 'System'} · {when(t.at)}</div>
                    </>
                  )}
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
