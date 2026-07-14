import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api, SALES_LEAD_STATUSES, type CallOutcome, type ConsignmentDoc, type ContactDetailResponse, type ContactType, type OwnerOption, type SalesLeadStatus } from '../lib/api'
import { AssigneePicker } from '../components/AssigneePicker'
import { CALL_OUTCOMES, CALL_OUTCOME_LABEL } from '../lib/callOutcomes'
import { recordRecent } from '../lib/recentlyViewed'
import { TYPE_LABEL, ownerLabel } from './Contacts'

type ActKind = 'note' | 'call' | 'email' | 'meeting'
type OpenForm = null | ActKind | 'task'
type TimelineFilter = 'all' | 'notes' | 'emails' | 'calls' | 'meetings' | 'tasks'

// One typed row in the merged activity+task stream.
interface TimelineActivity {
  itype: 'activity'
  kind: string
  id: string
  subject: string | null
  body: string
  date: string
  call_outcome: CallOutcome | null | undefined
  rep_name: string | null
}
interface TimelineTask {
  itype: 'task'
  id: string
  title: string
  date: string | null
  done_at: string | null
  owner_name: string | null
}
type TimelineItem = TimelineActivity | TimelineTask

const ACT_META: Record<ActKind, { label: string; glyph: string; cls: string }> = {
  note: { label: 'Note', glyph: '✎', cls: 'tl-note' },
  call: { label: 'Call', glyph: '☎', cls: 'tl-call' },
  email: { label: 'Email', glyph: '✉', cls: 'tl-email' },
  meeting: { label: 'Meeting', glyph: '◎', cls: 'tl-meeting' },
}
const FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'notes', label: 'Notes' },
  { key: 'emails', label: 'Emails' },
  { key: 'calls', label: 'Calls' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'tasks', label: 'Tasks' },
]

function money(cents: number | null): string {
  if (cents === null) return '—'
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}
function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
function initials(name: string | null, email: string | null): string {
  const base = (name ?? email ?? '?').trim()
  const parts = base.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return base.slice(0, 2).toUpperCase()
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
  const [savingLead, setSavingLead] = useState(false)
  const [savingOwner, setSavingOwner] = useState(false)

  // Center composer: which log/task form the action row has opened.
  const [openForm, setOpenForm] = useState<OpenForm>(null)
  const [actSubject, setActSubject] = useState('')
  const [actBody, setActBody] = useState('')
  const [callOutcome, setCallOutcome] = useState<CallOutcome | ''>('')
  const [savingAct, setSavingAct] = useState(false)

  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')  // '' = self
  const [savingTask, setSavingTask] = useState(false)
  const [completingTask, setCompletingTask] = useState<string | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)

  const [filter, setFilter] = useState<TimelineFilter>('all')

  const load = useCallback(() => {
    if (!contactId) return
    api.contactDetail(contactId)
      .then((res) => { setData(res); setError(''); recordRecent('contact', res.contact.id, res.contact.name ?? res.contact.email ?? 'Contact') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load contact'))
      .finally(() => setLoading(false))
  }, [contactId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.contactOwners().then((res) => setOwners(res.owners)).catch(() => setOwners([]))
  }, [])

  function openActivity(kind: ActKind) {
    setOpenForm(kind); setActSubject(''); setActBody(''); setCallOutcome('')
  }
  function openTask() {
    setOpenForm('task'); setTaskTitle(''); setTaskDue(''); setTaskAssignee('')
  }

  async function uploadContract(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const consignerId = data?.consignment?.consigner.id
    if (!file || !consignerId) return
    setUploadingDoc(true)
    try {
      await api.uploadDocument({ consigner_id: consignerId }, 'agreement', file)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingDoc(false)
    }
  }

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

  async function setLeadStatus(status: SalesLeadStatus | '') {
    if (!contactId) return
    setSavingLead(true)
    try {
      await api.updateContact(contactId, { sales_lead_status: status || null })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update lead status')
    } finally {
      setSavingLead(false)
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
    if (!contactId || openForm === null || openForm === 'task' || !actBody.trim()) return
    const kind = openForm
    if (kind === 'call' && callOutcome === '') return  // outcome required for a call
    const outcome: CallOutcome | null = kind === 'call' ? (callOutcome as CallOutcome) : null
    setSavingAct(true)
    try {
      await api.logContactActivity(contactId, {
        kind,
        subject: actSubject.trim() || undefined,
        body: actBody.trim(),
        call_outcome: outcome,
      })
      setActSubject(''); setActBody(''); setCallOutcome(''); setOpenForm(null)
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
      setTaskTitle(''); setTaskDue(''); setTaskAssignee(''); setOpenForm(null)
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

  // Merge activities + tasks into a single stream, filtered + grouped by month.
  const groups = useMemo(() => {
    if (!data) return [] as { key: string; items: TimelineItem[] }[]
    const items: TimelineItem[] = [
      ...data.activities.map((a): TimelineItem => ({
        itype: 'activity', kind: a.kind, id: a.id, subject: a.subject, body: a.body,
        date: a.occurred_at, call_outcome: a.call_outcome, rep_name: a.rep_name,
      })),
      ...data.tasks.map((t): TimelineItem => ({
        itype: 'task', id: t.id, title: t.title, date: t.due_at, done_at: t.done_at, owner_name: t.owner_name,
      })),
    ]
    const matches = (it: TimelineItem): boolean => {
      if (filter === 'all') return true
      if (filter === 'tasks') return it.itype === 'task'
      if (it.itype !== 'activity') return false
      if (filter === 'notes') return it.kind === 'note'
      if (filter === 'emails') return it.kind === 'email'
      if (filter === 'calls') return it.kind === 'call'
      if (filter === 'meetings') return it.kind === 'meeting'
      return false
    }
    const filtered = items.filter(matches)
    // Undated tasks float to the top; everything else newest-first.
    filtered.sort((a, b) => {
      if (!a.date && !b.date) return 0
      if (!a.date) return -1
      if (!b.date) return 1
      return b.date < a.date ? -1 : b.date > a.date ? 1 : 0
    })
    const out: { key: string; items: TimelineItem[] }[] = []
    for (const it of filtered) {
      const key = it.date ? monthLabel(it.date) : 'No due date'
      const last = out[out.length - 1]
      if (last && last.key === key) last.items.push(it)
      else out.push({ key, items: [it] })
    }
    return out
  }, [data, filter])

  if (loading) return <div className="admin-loading">Loading contact…</div>
  if (!data) return <div className="admin-loading">{error || 'Contact not found'}</div>

  const { contact, deals, activities, tasks, buy_opps, offers, consignment } = data
  const timelineCount = activities.length + tasks.length

  return (
    <div>
      <Link to="/contacts" className="back-link">← Back to contacts</Link>

      <div className="contact-record">
        {/* ── LEFT: About this contact ─────────────────────────────── */}
        <div className="crecord-col">
          <div className="panel">
            <div className="crecord-head">
              <div className="crecord-avatar">{initials(contact.name, contact.email)}</div>
              <div style={{ minWidth: 0 }}>
                <div className="crecord-name">{contact.name ?? contact.email ?? '(no name)'}</div>
                {contact.email && <div className="note" style={{ marginTop: 2, wordBreak: 'break-all' }}>{contact.email}</div>}
              </div>
            </div>

            {editing ? (
              <form onSubmit={saveEdit} style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="plat-input" style={{ flex: 1, minWidth: 110 }} placeholder="First name" value={edit.first_name} onChange={(e) => setEdit({ ...edit, first_name: e.target.value })} />
                  <input className="plat-input" style={{ flex: 1, minWidth: 110 }} placeholder="Last name" value={edit.last_name} onChange={(e) => setEdit({ ...edit, last_name: e.target.value })} />
                </div>
                <input className="plat-input" placeholder="Email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
                <input className="plat-input" placeholder="Phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
                <textarea className="plat-input" rows={2} placeholder="Hunting for (feeds buyer-need matching)" value={edit.hunting_for} onChange={(e) => setEdit({ ...edit, hunting_for: e.target.value })} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="plat-btn" type="submit" disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save'}</button>
                  <button className="plat-btn ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div className="crecord-about-head">
                  <span className="crecord-section">About this contact</span>
                  <button className="plat-btn ghost" onClick={startEdit}>Edit</button>
                </div>
                <div className="fieldrow"><span>Email</span><span>{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : '—'}</span></div>
                <div className="fieldrow"><span>Phone</span><span>{contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : '—'}</span></div>
                <div className="fieldrow">
                  <span>Company</span>
                  <span>{contact.company_id ? <Link to={`/companies/${contact.company_id}`}>{contact.company_name}</Link> : '—'}</span>
                </div>
                <div className="fieldrow">
                  <span>Lead Status</span>
                  <span>
                    <select className="plat-input type-select" value={contact.sales_lead_status ?? ''} disabled={savingLead}
                            onChange={(e) => setLeadStatus(e.target.value as SalesLeadStatus | '')}>
                      <option value="">Not set</option>
                      {SALES_LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </span>
                </div>
                <div className="fieldrow">
                  <span>Contact Type</span>
                  <span>
                    <select className="plat-input type-select" value={contact.contact_type} disabled={savingType}
                            onChange={(e) => setType(e.target.value as ContactType)}>
                      {(Object.keys(TYPE_LABEL) as ContactType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                    </select>
                  </span>
                </div>
                <div className="fieldrow">
                  <span>Owner</span>
                  <span>
                    {isAdmin ? (
                      <select className="plat-input type-select" value={contact.owner_id ?? ''} disabled={savingOwner}
                              onChange={(e) => reassignOwner(e.target.value)}>
                        <option value="">Unassigned</option>
                        {owners.map((o) => <option key={o.id} value={o.id}>{ownerLabel(o)}</option>)}
                      </select>
                    ) : (contact.owner_name ?? 'Unassigned')}
                  </span>
                </div>
                <div className="fieldrow"><span>Hunting for</span><span>{contact.hunting_for ?? '—'}</span></div>
                <div className="fieldrow"><span>Source</span><span>{contact.source}{contact.lead_status ? ` · ${contact.lead_status}` : ''}</span></div>
                <div className="fieldrow"><span>Created</span><span>{when(contact.created_at)}</span></div>
                <div className="fieldrow"><span>Record ID</span><span className="crecord-id">{contact.id}</span></div>
                {contact.legacy_source && <div className="note" style={{ marginTop: 6 }}>Imported from the HubSpot backfill.</div>}
              </>
            )}
          </div>
        </div>

        {/* ── CENTER: action row + unified timeline ────────────────── */}
        <div className="crecord-col">
          <div className="panel">
            <div className="crecord-actions">
              <button className="plat-btn ghost" onClick={() => openActivity('note')}>Note</button>
              <button className="plat-btn ghost" onClick={() => openActivity('call')}>Log call</button>
              <button className="plat-btn ghost" onClick={() => openActivity('email')}>Log email</button>
              <button className="plat-btn ghost" onClick={() => openActivity('meeting')}>Log meeting</button>
              <button className="plat-btn ghost" onClick={openTask}>Create task</button>
            </div>

            {openForm !== null && openForm !== 'task' && (
              <form onSubmit={submitActivity} className="crecord-composer">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <span className={`tl-badge ${ACT_META[openForm].cls}`}>{ACT_META[openForm].glyph}</span>
                  <b>Log {ACT_META[openForm].label.toLowerCase()}</b>
                  <button type="button" className="plat-btn ghost" style={{ marginLeft: 'auto' }} onClick={() => setOpenForm(null)}>Cancel</button>
                </div>
                <input className="plat-input" placeholder="Subject (optional)" value={actSubject} onChange={(e) => setActSubject(e.target.value)} />
                {openForm === 'call' && (
                  <select className="plat-input" style={{ maxWidth: 240 }} value={callOutcome} onChange={(e) => setCallOutcome(e.target.value as CallOutcome | '')}>
                    <option value="">Call outcome (required)</option>
                    {CALL_OUTCOMES.map((o) => <option key={o} value={o}>{CALL_OUTCOME_LABEL[o]}</option>)}
                  </select>
                )}
                <textarea className="plat-input" rows={3} placeholder={`${ACT_META[openForm].label} details`} value={actBody} onChange={(e) => setActBody(e.target.value)} />
                <button className="plat-btn" type="submit" disabled={savingAct || !actBody.trim() || (openForm === 'call' && callOutcome === '')}>
                  {savingAct ? 'Saving…' : `Log ${ACT_META[openForm].label.toLowerCase()}`}
                </button>
              </form>
            )}

            {openForm === 'task' && (
              <form onSubmit={submitTask} className="crecord-composer">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <span className="tl-badge tl-task">✓</span>
                  <b>Create task</b>
                  <button type="button" className="plat-btn ghost" style={{ marginLeft: 'auto' }} onClick={() => setOpenForm(null)}>Cancel</button>
                </div>
                <input className="plat-input" placeholder="Task title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
                <input className="plat-input" type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                <AssigneePicker value={taskAssignee} onChange={setTaskAssignee} />
                <button className="plat-btn" type="submit" disabled={savingTask || !taskTitle.trim()}>{savingTask ? 'Saving…' : 'Add task'}</button>
              </form>
            )}

            <div className="crecord-timeline-head">
              <span className="crecord-section">Activity <span className="c">{timelineCount}</span></span>
              <div className="tl-filter">
                {FILTERS.map((f) => (
                  <button key={f.key} className={`tl-chip${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
                ))}
              </div>
            </div>

            {groups.length === 0 ? (
              <div className="note">{filter === 'all' ? 'No activity logged yet.' : 'Nothing of this type yet.'}</div>
            ) : (
              groups.map((g) => (
                <div key={g.key}>
                  <div className="tl-month">{g.key}</div>
                  {g.items.map((it) => it.itype === 'activity' ? (
                    <div className="tl-item" key={it.id}>
                      <span className={`tl-badge ${ACT_META[(it.kind as ActKind)]?.cls ?? 'tl-note'}`}>{ACT_META[(it.kind as ActKind)]?.glyph ?? '•'}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div>
                          <span className="tl-kind">{ACT_META[(it.kind as ActKind)]?.label ?? it.kind}</span>
                          {it.kind === 'call' && it.call_outcome && (
                            <span className="pill trans" style={{ marginLeft: 6 }}>{CALL_OUTCOME_LABEL[it.call_outcome]}</span>
                          )}
                          {it.subject && <b style={{ marginLeft: 8 }}>{it.subject}</b>}
                        </div>
                        <div style={{ margin: '3px 0' }}>{it.body}</div>
                        <div className="when">{it.rep_name ?? 'Unknown'} · {when(it.date)}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="tl-item" key={it.id}>
                      <span className="tl-badge tl-task">✓</span>
                      <div style={{ minWidth: 0, flex: 1, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div>
                          <span className="tl-kind">Task</span>
                          <span style={{ marginLeft: 8, textDecoration: it.done_at ? 'line-through' : undefined }}>{it.title}</span>
                          <div className="when">
                            {it.owner_name ?? '—'}
                            {it.date ? ` · due ${new Date(it.date).toLocaleDateString()}` : ' · no due date'}
                            {it.done_at ? ' · done' : ''}
                          </div>
                        </div>
                        {!it.done_at && (
                          <button className="plat-btn ghost" disabled={completingTask === it.id} onClick={() => completeTask(it.id)}>
                            {completingTask === it.id ? '…' : 'Done'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT: associations rail ─────────────────────────────── */}
        <div className="crecord-col">
          <div className="panel">
            <h3>Deals <span className="c">{deals.length}</span></h3>
            {deals.length === 0 ? (
              <div className="note">No deals reference this contact.</div>
            ) : deals.map((d) => (
              <div className="hist-item" key={d.id}>
                <div>
                  <Link to={`/deals/${d.id}`}><b>{d.name}</b></Link>
                  {d.outcome && <span className={`pill ${d.outcome === 'won' ? 'green' : 'red'}`} style={{ marginLeft: 8 }}>{d.outcome}</span>}
                </div>
                <div className="when">{d.pipeline_name} · {d.stage_name} · {money(d.value_cents)}</div>
              </div>
            ))}
          </div>

          <div className="panel">
            <h3>Buy opps <span className="c">{buy_opps.length}</span></h3>
            {buy_opps.length === 0 ? (
              <div className="note">This contact isn't the buyer on any buy opps.</div>
            ) : buy_opps.map((b) => (
              <div className="hist-item" key={b.id}>
                <div>
                  <Link to={`/buyer-opportunities/${b.id}`}><b>{b.name}</b></Link>
                  {b.outcome && <span className={`pill ${b.outcome === 'won' ? 'green' : 'red'}`} style={{ marginLeft: 8 }}>{b.outcome}</span>}
                </div>
                <div className="when">
                  {b.stage_name}
                  {b.probability_to_close !== null ? ` · ${b.probability_to_close}%` : ''}
                  {b.expected_close ? ` · close ~ ${new Date(b.expected_close).toLocaleDateString()}` : ''}
                  {` · ${b.unit_count} unit${b.unit_count === 1 ? '' : 's'}`}
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <h3>Offer history <span className="c">{offers.length}</span></h3>
            {offers.length === 0 ? (
              <div className="note">No offers from this contact.</div>
            ) : offers.map((o) => (
              <div className="hist-item" key={o.id}>
                <div>
                  <Link to={`/units/${o.unit_id}`} style={{ color: 'var(--p-gold)', fontWeight: 'bold' }}>
                    {o.unit_legacy_id ? `#${o.unit_legacy_id} ` : ''}{o.unit_title}
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
            ))}
          </div>

          {consignment && (
            <div className="panel">
              <h3>Consignment <span className="c">{consignment.units.length}</span></h3>
              <div className="fieldrow">
                <span>Split terms</span>
                <span>{consignment.consigner.split_terms ?? '—'}{consignment.consigner.split_pct !== null ? ` · ${consignment.consigner.split_pct}%` : ''}</span>
              </div>
              <div className="fieldrow"><span>Payout status</span><span>{consignment.consigner.payout_status ?? '—'}</span></div>
              <div className="fieldrow"><span>Payment on file</span><span>{consignment.consigner.payment_details_on_file ? 'Yes' : 'No'}</span></div>
              {consignment.consigner.notes && <div className="note">{consignment.consigner.notes}</div>}

              <h4 style={{ margin: '12px 0 4px' }}>Consigned items <span className="c">{consignment.units.length}</span></h4>
              {consignment.units.length === 0 ? (
                <div className="note">No consigned units linked yet.</div>
              ) : consignment.units.map((u) => (
                <div className="hist-item" key={u.unit_id}>
                  <Link to={`/units/${u.unit_id}`} style={{ color: 'var(--p-gold)', fontWeight: 'bold' }}>
                    {u.legacy_id ? `#${u.legacy_id} ` : ''}{u.title}
                  </Link>
                  <span className="pill grey" style={{ marginLeft: 8 }}>{u.status.replace('_', ' ')}</span>
                  <div className="when">
                    {u.listed_on_website && u.website_url
                      ? <a href={u.website_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--p-gold)' }}>live listing ↗</a>
                      : <span style={{ color: 'var(--p-body)' }}>not listed on the website yet</span>}
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 4px' }}>
                <h4 style={{ margin: 0 }}>Contract</h4>
                {consignment.documents_configured && (
                  <label className="plat-btn ghost" style={{ cursor: uploadingDoc ? 'default' : 'pointer', marginLeft: 'auto' }}>
                    {uploadingDoc ? 'Uploading…' : 'Upload contract'}
                    <input type="file" style={{ display: 'none' }} disabled={uploadingDoc} onChange={uploadContract} />
                  </label>
                )}
              </div>
              <ConsignDocs docs={consignment.contract_docs} configured={consignment.documents_configured} emptyLabel="No contract uploaded yet." />
              <h4 style={{ margin: '12px 0 4px' }}>Related docs</h4>
              <ConsignDocs docs={consignment.related_docs} configured={consignment.documents_configured} emptyLabel="No related documents." />
            </div>
          )}
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
    return <div className="note">Document storage isn't enabled yet. Contracts appear here once R2 is configured.</div>
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
