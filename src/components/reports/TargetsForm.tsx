import { useEffect, useState } from 'react'
import { api, type UserTargets } from '../../lib/api'
import { useToast } from '../shell/ToastContext'

// One target editor, two homes: inline on the goal gauge (set it where you can
// see what it measures) and in Settings > Team (set it where you manage the
// person). Two copies of this form would be two readings of what a blank field
// means, and "blank clears the target" is exactly the rule that must not drift.
//
// DOLLARS IN, CENTS OUT. A quota is spoken in dollars; the codebase stores
// money as integer cents. The conversion lives here, once.
//
// BLANK IS NOT ZERO. An empty field clears the target back to "not set" — the
// state the gauge renders as an invitation. Typing 0 is a different statement
// (a target of nothing) and is preserved as one. The server agrees: PUT
// replaces the whole row and null means unset.

interface FormProps {
  userId: string
  current: UserTargets
  onSaved: (saved: UserTargets) => void
  onCancel?: () => void
}

export function TargetsForm({ userId, current, onSaved, onCancel }: FormProps) {
  const toast = useToast()
  const [dollars, setDollars] = useState(
    current.monthly_won_value_target_cents === null
      ? '' : String(Math.round(current.monthly_won_value_target_cents / 100)))
  const [calls, setCalls] = useState(
    current.weekly_call_target === null ? '' : String(current.weekly_call_target))
  const [saving, setSaving] = useState(false)

  // Adopt a freshly fetched value rather than stranding the form on a stale one.
  useEffect(() => {
    setDollars(current.monthly_won_value_target_cents === null
      ? '' : String(Math.round(current.monthly_won_value_target_cents / 100)))
    setCalls(current.weekly_call_target === null ? '' : String(current.weekly_call_target))
  }, [current.monthly_won_value_target_cents, current.weekly_call_target])

  /** '' -> null (clear). Anything that is not a non-negative whole number is
   *  rejected here so the rep sees why, rather than as a 422 from the server. */
  function parse(raw: string): number | null | 'bad' {
    const t = raw.trim()
    if (t === '') return null
    if (!/^\d+$/.test(t)) return 'bad'
    const n = Number(t)
    return Number.isSafeInteger(n) ? n : 'bad'
  }

  async function save() {
    const d = parse(dollars)
    const c = parse(calls)
    if (d === 'bad' || c === 'bad') {
      toast.error('That target does not look right',
                  'Use a whole number, or leave it blank to clear the target.')
      return
    }
    const payload: UserTargets = {
      monthly_won_value_target_cents: d === null ? null : d * 100,
      weekly_call_target: c,
    }
    setSaving(true)
    try {
      await api.setUserTargets(userId, payload)
      toast.info('Targets saved',
                 d === null && c === null
                   ? 'Both targets cleared.'
                   : 'The gauge is measuring against them now.')
      onSaved(payload)
    } catch (e) {
      toast.error('Could not save those targets',
                  e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="goal-edit">
      <label className="goal-edit-row">
        <span>Monthly closed-won target ($)</span>
        <input className="plat-input" inputMode="numeric" value={dollars}
               placeholder="blank = no target"
               onChange={(e) => setDollars(e.target.value)} />
      </label>
      <label className="goal-edit-row">
        <span>Calls per week</span>
        <input className="plat-input" inputMode="numeric" value={calls}
               placeholder="blank = no target"
               onChange={(e) => setCalls(e.target.value)} />
      </label>
      <div className="goal-edit-act">
        <button type="button" className="plat-btn" disabled={saving}
                onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save targets'}
        </button>
        {onCancel && (
          <button type="button" className="plat-btn ghost" onClick={onCancel}
                  disabled={saving}>Cancel</button>
        )}
      </div>
    </div>
  )
}

interface ModalProps {
  userId: string
  userName: string
  onClose: () => void
}

/** The Settings > Team home for the same form. Fetches the user's current
 *  targets first so an admin edits what is actually stored rather than
 *  overwriting it from a blank slate. */
export function TargetsModal({ userId, userName, onClose }: ModalProps) {
  const [current, setCurrent] = useState<UserTargets | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    api.userTargets(userId)
      .then((t) => setCurrent({
        monthly_won_value_target_cents: t.monthly_won_value_target_cents,
        weekly_call_target: t.weekly_call_target,
      }))
      .catch(() => setFailed(true))
  }, [userId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ws-modal-scrim" onMouseDown={onClose} role="presentation">
      <div className="ws-modal panel" role="dialog" aria-modal="true"
           aria-label={`Targets for ${userName}`}
           onMouseDown={(e) => e.stopPropagation()}>
        <div className="ws-modal-head">
          <h3>Targets · {userName}</h3>
          <button type="button" className="plat-btn ghost" onClick={onClose}>Close</button>
        </div>
        <div className="note" style={{ marginBottom: 10 }}>
          These drive the goal gauge on {userName}’s My Day. Leave a field blank
          to clear that target — the gauge then invites one rather than showing 0%.
        </div>
        {failed ? (
          <div className="note" style={{ color: '#B4432B' }}>
            Could not load current targets. Close and try again.
          </div>
        ) : current === null ? (
          <div className="admin-loading">Loading targets…</div>
        ) : (
          <TargetsForm userId={userId} current={current}
                       onSaved={onClose} onCancel={onClose} />
        )}
      </div>
    </div>
  )
}
