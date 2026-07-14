import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type TaskItem } from '../lib/api'
import { AssigneePicker } from '../components/AssigneePicker'
import { useToast } from '../components/shell/ToastContext'

// "My Tasks" — the real list behind GET /platform/tasks (api.myTasks), plus a
// create form. Task create is optimistic (Phase 4): a self-assigned task
// appears instantly and rolls back on failure; assigning to another rep sends
// it to their list and confirms via toast. Opens the form on ?new=1.

function dueLabel(dueAt: string | null): { text: string; cls: string } {
  if (!dueAt) return { text: 'No due date', cls: '' }
  const due = new Date(dueAt); const today = new Date()
  const days = Math.floor((due.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86_400_000)
  if (days < 0) return { text: `Overdue (${new Date(dueAt).toLocaleDateString()})`, cls: 'over' }
  if (days === 0) return { text: 'Due today', cls: 'due' }
  return { text: new Date(dueAt).toLocaleDateString(), cls: '' }
}

interface OptimisticTask extends TaskItem { _pending?: boolean }

export function Tasks() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState<OptimisticTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [creating, setCreating] = useState(searchParams.get('new') === '1')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState('')  // '' = self
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)

  const load = useCallback(() => {
    api.myTasks()
      .then((r) => { setTasks(r.tasks); setError('') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load tasks'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function closeCreate() {
    setCreating(false)
    if (searchParams.get('new')) { searchParams.delete('new'); setSearchParams(searchParams, { replace: true }) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    const dueIso = due ? new Date(due + 'T17:00:00').toISOString() : undefined
    const toOther = assignee !== ''
    setSaving(true)

    // Optimistic: only self-assigned tasks belong in *my* list.
    const tempId = `temp-${Date.now()}`
    const prev = tasks
    if (!toOther) {
      setTasks([{ id: tempId, title: t, due_at: dueIso ?? null, deal_id: null, deal_name: null, unit_id: null, unit_title: null, _pending: true }, ...tasks])
    }
    setTitle(''); setDue(''); setAssignee('')

    try {
      const res = await api.createTask({ title: t, due_at: dueIso, assignee_id: toOther ? assignee : undefined })
      if (toOther) {
        toast.info('Task assigned', 'Sent to the assigned rep’s list.')
      } else {
        // swap the temp row for the real id
        setTasks((cur) => cur.map((x) => (x.id === tempId ? { ...x, id: res.id, _pending: false } : x)))
      }
    } catch (err) {
      if (!toOther) setTasks(prev)  // rollback
      toast.error('Task not created', err instanceof Error ? err.message : 'Please try again.')
      setTitle(t); setDue(due); setAssignee(assignee)
    } finally {
      setSaving(false)
    }
  }

  async function complete(id: string) {
    if (id.startsWith('temp-')) return
    setCompleting(id)
    const prev = tasks
    setTasks((cur) => cur.filter((x) => x.id !== id))  // optimistic removal
    try {
      await api.completeTask(id)
    } catch (err) {
      setTasks(prev)
      toast.error('Could not complete task', err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setCompleting(null)
    }
  }

  if (loading) return <div className="admin-loading">Loading tasks…</div>

  return (
    <div>
      <div className="panel" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>My tasks</h3>
          <button className="plat-btn" style={{ marginLeft: 'auto' }} onClick={() => (creating ? closeCreate() : setCreating(true))}>
            {creating ? 'Cancel' : '+ New task'}
          </button>
        </div>
        {creating && (
          <form onSubmit={submit} style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input className="plat-input" style={{ flex: '2 1 220px', marginBottom: 0 }} placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <input className="plat-input" style={{ flex: '1 1 150px', marginBottom: 0 }} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <div style={{ flex: '1 1 180px' }}><AssigneePicker value={assignee} onChange={setAssignee} /></div>
            <button className="plat-btn" type="submit" disabled={saving || !title.trim()}>{saving ? 'Adding…' : 'Add task'}</button>
          </form>
        )}
      </div>

      <div className="panel">
        {tasks.length === 0 ? (
          <div className="note">No open tasks. Nicely done.</div>
        ) : (
          <table className="plat-table">
            <thead><tr><th>Task</th><th>Linked to</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {tasks.map((t) => {
                const d = dueLabel(t.due_at)
                return (
                  <tr key={t.id} className={t._pending ? 'ws-pending' : undefined}>
                    <td>{t.title}</td>
                    <td>
                      {t.deal_id ? <Link to={`/deals/${t.deal_id}`} style={{ color: 'var(--p-gold)', fontWeight: 'bold' }}>{t.deal_name ?? 'Deal'}</Link>
                        : t.unit_title ? <span>{t.unit_title}</span> : <span style={{ color: 'var(--p-body)' }}>—</span>}
                    </td>
                    <td style={{ color: d.cls === 'over' ? '#B4432B' : d.cls === 'due' ? 'var(--p-gold)' : 'var(--p-body)', fontWeight: d.cls ? 'bold' : undefined }}>{d.text}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="plat-btn ghost" disabled={completing === t.id || t._pending} onClick={() => complete(t.id)}>
                        {completing === t.id ? 'Saving…' : 'Complete'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      </div>
    </div>
  )
}
