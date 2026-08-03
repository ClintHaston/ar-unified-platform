import { useEffect, useState, type FormEvent } from 'react'
import { api, type CallOutcome, type QuickLogAnchor,
         type QuickLogInput } from '../../lib/api'
import { CALL_OUTCOMES, CALL_OUTCOME_LABEL } from '../../lib/callOutcomes'
import { useToast } from '../shell/ToastContext'
import { AnchorPicker } from './AnchorPicker'

// The quick-log form: log a call, log a note, or create a task, from anywhere,
// without leaving the page you are on.
//
// THE WHOLE DESIGN GOAL IS TAP COUNT. A rep who has to navigate to log a call
// stops logging calls, and every number downstream quietly becomes fiction. So
// the shortest real path — open, tap an outcome chip, Enter — is three
// interactions and requires typing nothing.
//
// Modal shell reuses the shipped drill-popup idiom (scrim + panel, Escape to
// close, click-outside to close) via shared .ws-modal-* rules, so this is not
// a second modal language.

type Mode = 'call' | 'note' | 'task'

const TITLES: Record<Mode, { head: string; verb: string }> = {
  call: { head: 'Log a call', verb: 'Log call' },
  note: { head: 'Log a note', verb: 'Log note' },
  task: { head: 'New task', verb: 'Add task' },
}

// Natural due dates. A rep thinks "tomorrow", not "2026-08-03" — the date
// input stays available for the times they really do mean a specific day.
type Preset = { label: string; days: number }
const DUE_PRESETS: Preset[] = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'Next week', days: 7 },
]

/** YYYY-MM-DD, `days` from today, in the browser's local calendar. */
function isoDaysAhead(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return new Intl.DateTimeFormat('en-CA').format(d)
}

// Matches the shipped Tasks page exactly: a date means end of that business
// day, not midnight. Two different meanings for "due Tuesday" across two
// forms is how a task shows up a day early on one screen.
function dueIso(date: string): string | undefined {
  return date ? new Date(date + 'T17:00:00').toISOString() : undefined
}

// The anchor as the ONE id field the server expects. Written as a switch
// rather than a computed key so the compiler still checks that every anchor
// type maps to a real field — a computed key would type as `string` and let a
// typo through to a 422 at runtime.
function anchorField(a: QuickLogAnchor): Partial<QuickLogInput> {
  switch (a.type) {
    case 'deal': return { deal_id: a.id }
    case 'contact': return { contact_id: a.id }
    case 'unit': return { unit_id: a.id }
    case 'buyer_opportunity': return { buyer_opportunity_id: a.id }
  }
}

interface Props {
  mode: Mode
  anchor: QuickLogAnchor | null
  onClose: () => void
  onLogged: () => void
}

export function QuickLogModal({ mode, anchor: initialAnchor, onClose, onLogged }: Props) {
  const toast = useToast()
  const [anchor, setAnchor] = useState<QuickLogAnchor | null>(initialAnchor)
  const [outcome, setOutcome] = useState<CallOutcome | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Pre-anchored (opened from a deal or contact page) means the "what is this
  // about?" question is already answered, so the cursor starts on the part
  // that still needs the rep instead of on a search box with nothing to find.
  const preAnchored = initialAnchor !== null

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Tasks anchor to a deal, contact or unit; platform.tasks has no buy-opp
  // column. Said out loud rather than dropped silently.
  const buyOppTask = mode === 'task' && anchor?.type === 'buyer_opportunity'

  const canSubmit = mode === 'task'
    ? title.trim().length > 0
    : Boolean(anchor) && (mode === 'call'
      ? outcome !== null                      // one tap is a complete call log
      : body.trim().length > 0 || subject.trim().length > 0)

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!canSubmit || saving) return
    setSaving(true)
    setError('')
    try {
      if (mode === 'task') {
        await api.createTask({
          title: title.trim(),
          due_at: dueIso(due),
          deal_id: anchor?.type === 'deal' ? anchor.id : undefined,
          contact_id: anchor?.type === 'contact' ? anchor.id : undefined,
          unit_id: anchor?.type === 'unit' ? anchor.id : undefined,
        })
        toast.info('Task added', due
          ? `Due ${new Date(due + 'T17:00:00').toLocaleDateString()}.`
          : 'No due date — it will sit on your list until you set one.')
      } else {
        await api.quickLog({
          kind: mode,
          body: body.trim() || undefined,
          subject: subject.trim() || undefined,
          call_outcome: mode === 'call' ? outcome : undefined,
          ...anchorField(anchor!),
        })
        toast.info(mode === 'call' ? 'Call logged' : 'Note logged',
                   `On ${anchor!.label}.`)
      }
      onLogged()
      onClose()
    } catch (err) {
      // The modal stays open with everything the rep typed still in it —
      // closing on failure would throw away the note they just wrote.
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.')
      setSaving(false)
    }
  }

  function onFormKeyDown(e: React.KeyboardEvent) {
    // Ctrl/Cmd+Enter submits from inside the textarea, where plain Enter has
    // to keep meaning "new line".
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void submit() }
  }

  const t = TITLES[mode]

  return (
    <div className="ws-modal-scrim" onMouseDown={onClose} role="presentation">
      <form
        className="ws-modal panel ql-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
        onKeyDown={onFormKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={t.head}
      >
        <div className="ws-modal-head">
          <h3>{t.head}</h3>
          <button type="button" className="plat-btn ghost" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>

        <label className="ql-label">
          {mode === 'task' ? 'Attach to (optional)' : 'What is this about?'}
        </label>
        <AnchorPicker
          value={anchor}
          onPick={setAnchor}
          optional={mode === 'task'}
          autoFocus={!preAnchored}
        />
        {buyOppTask && (
          <div className="note ql-warn">
            Tasks attach to a deal, contact or unit — this buy opportunity
            won’t be linked. Log a note on it instead, or pick something else.
          </div>
        )}

        {mode === 'call' && (
          <>
            <label className="ql-label">How did it go?</label>
            <div className="ql-chips" role="radiogroup" aria-label="Call outcome">
              {CALL_OUTCOMES.map((o) => (
                <button
                  type="button"
                  key={o}
                  role="radio"
                  aria-checked={outcome === o}
                  className={`ql-chip${outcome === o ? ' on' : ''}`}
                  onClick={() => setOutcome(o)}
                >
                  {CALL_OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
            <label className="ql-label" htmlFor="ql-body">Note (optional)</label>
            <textarea
              id="ql-body"
              className="plat-input ql-textarea"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Anything worth remembering next time…"
              autoFocus={preAnchored}
            />
          </>
        )}

        {mode === 'note' && (
          <>
            <label className="ql-label" htmlFor="ql-subject">Subject (optional)</label>
            <input
              id="ql-subject"
              className="plat-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Wants a walkaround video"
            />
            <label className="ql-label" htmlFor="ql-body">Note</label>
            <textarea
              id="ql-body"
              className="plat-input ql-textarea"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What happened?"
              autoFocus={preAnchored}
            />
          </>
        )}

        {mode === 'task' && (
          <>
            <label className="ql-label" htmlFor="ql-title">What needs doing?</label>
            <input
              id="ql-title"
              className="plat-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Send the Peterbilt spec sheet"
              autoFocus={preAnchored}
            />
            <label className="ql-label">Due</label>
            <div className="ql-chips">
              {DUE_PRESETS.map((p) => {
                const iso = isoDaysAhead(p.days)
                return (
                  <button
                    type="button"
                    key={p.label}
                    className={`ql-chip${due === iso ? ' on' : ''}`}
                    onClick={() => setDue(due === iso ? '' : iso)}
                  >
                    {p.label}
                  </button>
                )
              })}
              <input
                type="date"
                className="plat-input ql-date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                aria-label="Custom due date"
              />
            </div>
          </>
        )}

        {error && <div className="note ql-error">{error}</div>}

        <div className="ws-modal-foot">
          <span className="note ql-hint">Ctrl + Enter to save</span>
          <button type="button" className="plat-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="plat-btn" disabled={!canSubmit || saving}>
            {saving ? 'Saving…' : t.verb}
          </button>
        </div>
      </form>
    </div>
  )
}
