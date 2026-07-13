import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api, type ConsignmentDoc, type ContactDetailResponse, type ContactType, type OwnerOption } from '../lib/api'
import { AssigneePicker } from '../components/AssigneePicker'
import { TYPE_LABEL, TYPE_PILL, ownerLabel } from './Contacts'

function money(cents: number | null): string {
  if (cents === null) return '—'
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function ContactDetail() {
  const { contactId } = useParams<{ contactId: string }>()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [data, setData] = useState<ContactDetailResponse | null>(null)
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState({ first_name: '', last_name: '', email: '', phone: '', hunting_for: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [savingType, setSavingType] = useState(false)
  const [savingOwner, setSavingOwner] = useState(false)

  const [actKind, setActKind] = useState<'note' | 'call'>('note')
  const [actSubject, setActSubject] = useState('')
  const [actBody, setActBody] = useState('')
  const [savingAct, setSavingAct] = useState(false)

  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')  // '' = self
  const [savingTask, setSavingTask] = useState(false)
  const [completingTask, setCompletingTask] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!contactId) return
    api.contactDetail(contactId)
      .then((res) => { setData(res); setError('') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load contact'))
      .finally(() => setLoading(false))
  }, [contactId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.contactOwners().then((res) => setOwners(res.owners)).catch(() => setOwners([]))
  }, [])

  function startEdit() {
    if (!data) return
    setEdit({
      first_name: data.contact.first_name ?? '',
      last_name: data.contact.last_name ?? '',
      email: data.contact.email ?? '',
      phone: data.contact.phone ?? '',
      hunting_for: data.contact.hunting_for ?? '',
    })
    setEditing(true)
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!contactId) return
    setSavingEdit(true)
    try {
      await api.updateContact(contactId, {
        first_name: edit.first_name.trim() || null,
        last_name: edit.last_name.trim() || null,
        email: edit.email.trim() || null,
        phone: edit.phone.trim() || null,
        hunting_for: edit.hunting_for.trim() || null,
      })
      setEditing(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingEdit(false)
    }
  }

  async function setType(type: ContactType) {
    if (!contactId) return
    setSavingType(true)
    try {
      await api.updateContact(contactId, { contact_type: type })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update type')
    } finally {
      setSavingType(false)
    }
  }

  async function reassignOwner(ownerId: string) {
    if (!contactId) return
    setSavingOwner(true)
    try {
      await api.reassignContactOwner(contactId, ownerId || null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reassign owner')
    } finally {
      setSavingOwner(false)
    }
  }

  async function submitActivity(e: FormEvent) {
    e.preventDefault()
    if (!contactId || !actBody.trim()) return
    setSavingAct(true)
    try {
      await api.logContactActivity(contactId, {
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
    if (!contactId || !taskTitle.trim()) return
    setSavingTask(true)
    try {
      await api.createTask({
        title: taskTitle.trim(),
        due_at: taskDue ? new Date(taskDue + 'T17:00:00').toISOString() : undefined,
        contact_id: contactId,
        assignee_id: taskAssignee || undefined,
      })
      setTaskTitle('')
      setTaskDue('')
      setTaskAssignee('')
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

  if (loading) return <div className="admin-loading">Loading contact…</div>
  if (!data) return <div className="admin-loading">{error || 'Contact not found'}</div>

  const { contact, deals, activities, tasks, buy_opps, offers, consignment } = data

  return (
    <div>
      <Link to="/contacts" className="back-link">← Back to contacts</Link>

      <div className="detail-grid">
        <div>
          <div className="panel">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {contact.name ?? contact.email ?? '(no name)'}
              <span className={`pill ${TYPE_PILL[contact.contact_type]}`}>{TYPE_LABEL[contact.contact_type]}</span>
              {!editing && (
                <button className="plat-btn ghost" style={{ marginLeft: 'auto' }} onClick={startEdit}>Edit</button>
              )}
            </h3>

            {editing ? (
              <form onSubmit={saveEdit}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="plat-input" style={{ flex: 1, minWidth: 130 }} placeholder="First name" value={edit.first_name} onChange={(e) => setEdit({ ...edit, first_name: e.target.value })} />
                  <input className="plat-input" style={{ flex: 1, minWidth: 130 }} placeholder="Last name" value={edit.last_name} onChange={(e) => setEdit({ ...edit, last_name: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="plat-input" style={{ flex: 1, minWidth: 170 }} placeholder="Email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
                  <input className="plat-input" style={{ flex: 1, minWidth: 130 }} placeholder="Phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
                </div>
                <textarea className="plat-input" rows={2} placeholder="Hunting for (feeds buyer-need matching)…" value={edit.hunting_for} onChange={(e) => setEdit({ ...edit, hunting_for: e.target.value })} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="plat-btn" type="submit" disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save'}</button>
                  <button className="plat-btn ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div className="fieldrow"><span>Email</span><span>{contact.email ?? '—'}</span></div>
                <div className="fieldrow"><span>Phone</span><span>{contact.phone ?? '—'}</span></div>
                <div className="fieldrow">
                  <span>Company</span>
                  <span>
                    {contact.company_id
                      ? <Link to={`/contacts?company_id=${contact.company_id}`}>{contact.company_name}</Link>
                      : '—'}
                  </span>
                </div>
                <div className="fieldrow">
                  <span>Type</span>
                  <span>
                    <select
                      className="plat-input type-select"
                      value={contact.contact_type}
                      disabled={savingType}
                      onChange={(e) => setType(e.target.value as ContactType)}
                    >
                      {(Object.keys(TYPE_LABEL) as ContactType[]).map((t) => (
                        <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                  </span>
                </div>
                <div className="fieldrow">
                  <span>Owner</span>
                  <span>
                    {isAdmin ? (
                      <select
                        className="plat-input type-select"
                        value={contact.owner_id ?? ''}
                        disabled={savingOwner}
                        onChange={(e) => reassignOwner(e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {owners.map((o) => (
                          <option key={o.id} value={o.id}>{ownerLabel(o)}</option>
                        ))}
                      </select>
                    ) : (
                      contact.owner_name ?? 'Unassigned'
                    )}
                  </span>
                </div>
                <div className="fieldrow"><span>Hunting for</span><span>{contact.hunting_for ?? '—'}</span></div>
                <div className="fieldrow"><span>Source</span><span>{contact.source}{contact.lead_status ? ` · ${contact.lead_status}` : ''}</span></div>
                {contact.legacy_source && (
                  <div className="note">Imported from HubSpot backfill · created {when(contact.created_at)}</div>
                )}
              </>
            )}
          </div>

          {consignment && (
            <div className="panel">
              <h3>Consignment</h3>
              <div className="fieldrow">
                <span>Split terms</span>
                <span>
                  {consignment.consigner.split_terms ?? '—'}
                  {consignment.consigner.split_pct !== null ? ` · ${consignment.consigner.split_pct}%` : ''}
                </span>
              </div>
              <div className="fieldrow"><span>Payout status</span><span>{consignment.consigner.payout_status ?? '—'}</span></div>
              <div className="fieldrow"><span>Payment details on file</span><span>{consignment.consigner.payment_details_on_file ? 'Yes' : 'No'}</span></div>
              {consignment.consigner.notes && <div className="note">{consignment.consigner.notes}</div>}

              <h4 style={{ margin: '12px 0 4px' }}>Consigned items <span className="c">{consignment.units.length}</span></h4>
              {consignment.units.length === 0 ? (
                <div className="note">No consigned units linked yet — intake links units to a consigner; backfilled TAB units may not have one.</div>
              ) : (
                consignment.units.map((u) => (
                  <div className="hist-item" key={u.unit_id}>
                    <Link to={`/units/${u.unit_id}`} style={{ color: 'var(--p-gold)', fontWeight: 'bold' }}>
                      {u.legacy_id ? `#${u.legacy_id} — ` : ''}{u.title}
                    </Link>
                    <span className="pill grey" style={{ marginLeft: 8 }}>{u.status.replace('_', ' ')}</span>
                    <div className="when">
                      {u.listed_on_website && u.website_url
                        ? <a href={u.website_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--p-gold)' }}>live listing ↗</a>
                        : <span style={{ color: 'var(--p-body)' }}>not listed on the website yet</span>}
                    </div>
                  </div>
                ))
              )}

              <h4 style={{ margin: '12px 0 4px' }}>Contract</h4>
              <ConsignDocs docs={consignment.contract_docs} configured={consignment.documents_configured} emptyLabel="No contract uploaded yet." />
              <h4 style={{ margin: '12px 0 4px' }}>Related docs</h4>
              <ConsignDocs docs={consignment.related_docs} configured={consignment.documents_configured} emptyLabel="No related documents." />
            </div>
          )}

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
            <h3>Deals</h3>
            {deals.length === 0 ? (
              <div className="note">No deals reference this contact.</div>
            ) : (
              deals.map((d) => (
                <div className="hist-item" key={d.id}>
                  <div>
                    <Link to={`/deals/${d.id}`}><b>{d.name}</b></Link>
                    {d.outcome && (
                      <span className={`pill ${d.outcome === 'won' ? 'green' : 'red'}`} style={{ marginLeft: 8 }}>{d.outcome}</span>
                    )}
                  </div>
                  <div className="when">{d.pipeline_name} · {d.stage_name} · {money(d.value_cents)}</div>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <h3>Buy opps</h3>
            {buy_opps.length === 0 ? (
              <div className="note">This contact isn't the buyer on any buy opps.</div>
            ) : (
              buy_opps.map((b) => (
                <div className="hist-item" key={b.id}>
                  <div>
                    <Link to={`/buyer-opportunities/${b.id}`}><b>{b.name}</b></Link>
                    {b.outcome && (
                      <span className={`pill ${b.outcome === 'won' ? 'green' : 'red'}`} style={{ marginLeft: 8 }}>{b.outcome}</span>
                    )}
                  </div>
                  <div className="when">
                    {b.stage_name}
                    {b.probability_to_close !== null ? ` · ${b.probability_to_close}%` : ''}
                    {b.expected_close ? ` · close ~ ${new Date(b.expected_close).toLocaleDateString()}` : ''}
                    {` · ${b.unit_count} unit${b.unit_count === 1 ? '' : 's'}`}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <h3>Offer history</h3>
            {offers.length === 0 ? (
              <div className="note">No offers from this contact.</div>
            ) : (
              offers.map((o) => (
                <div className="hist-item" key={o.id}>
                  <div>
                    <Link to={`/units/${o.unit_id}`} style={{ color: 'var(--p-gold)', fontWeight: 'bold' }}>
                      {o.unit_legacy_id ? `#${o.unit_legacy_id} — ` : ''}{o.unit_title}
                    </Link>
                    <span className={`pill ${o.status === 'accepted' ? 'green' : o.status === 'open' ? 'gold' : 'grey'}`} style={{ marginLeft: 8 }}>
                      {o.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="when">
                    {money(o.amount_cents)}
                    {o.status === 'open' && o.expires_at ? ` · expires ${new Date(o.expires_at).toLocaleDateString()}` : ''}
                    {o.responded_at ? ` · responded ${new Date(o.responded_at).toLocaleDateString()}` : ''}
                    {' · '}
                    {o.listed_on_website && o.website_url
                      ? <a href={o.website_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--p-gold)' }}>live listing ↗</a>
                      : <span style={{ color: 'var(--p-body)' }}>not listed</span>}
                    {o.deal_id && o.deal_name ? <> · <Link to={`/deals/${o.deal_id}`} style={{ color: 'var(--p-gold)' }}>{o.deal_name}</Link></> : ''}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <h3>Tasks</h3>
            <form onSubmit={submitTask} style={{ marginBottom: 12 }}>
              <input
                className="plat-input"
                placeholder="New task for this contact…"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
              />
              <input
                className="plat-input"
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
              />
              <AssigneePicker value={taskAssignee} onChange={setTaskAssignee} />
              <button className="plat-btn" type="submit" disabled={savingTask || !taskTitle.trim()}>
                {savingTask ? 'Saving…' : 'Add task'}
              </button>
            </form>
            {tasks.length === 0 ? (
              <div className="note">No tasks on this contact.</div>
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

interface ConsignDocsProps {
  docs: ConsignmentDoc[]
  configured: boolean
  emptyLabel: string
}

// Reuses the 3c-8 storage-aware pattern: while R2 is unconfigured, render the
// pending state, never a broken link.
function ConsignDocs({ docs, configured, emptyLabel }: ConsignDocsProps) {
  if (!configured) {
    return <div className="note">Document storage isn't enabled yet — contracts appear here once R2 is configured.</div>
  }
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
