import { useCallback, useEffect, useState } from 'react'
import { api, type EmailLogRow, type SettingRow } from '../lib/api'
import { UserManagement } from '../components/UserManagement'

// Step 3c-1: tab-level permission toggles retired with the legacy auth —
// access is rep-vs-admin by role now. 3c-7 adds the Settings editor over
// the §4 platform.settings rows (typed server-side; preview_mode is the
// cutover switch and sits behind a confirm) and the email log — the
// previewable record of what the preview-mode guard suppressed.

function SettingEditor({ setting, onSaved, onError }: {
  setting: SettingRow
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [draft, setDraft] = useState<string>(
    setting.value === null || setting.value === undefined ? '' : String(setting.value)
  )
  const [saving, setSaving] = useState(false)

  async function save(value: unknown, confirm = false) {
    setSaving(true)
    try {
      await api.updateSetting(setting.key, value, confirm)
      onSaved()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save setting')
    } finally {
      setSaving(false)
    }
  }

  if (setting.type === 'readonly') {
    return (
      <span className="setting-value">
        {JSON.stringify(setting.value)} <span className="note" style={{ marginLeft: 6 }}>read-only in this build</span>
      </span>
    )
  }

  if (setting.type === 'bool') {
    const on = setting.value === true
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={on}
          disabled={saving}
          onChange={() => {
            if (setting.confirm) {
              const target = !on
              const ok = window.confirm(
                `Change ${setting.label} to ${target ? 'ON' : 'OFF'}?\n\n` +
                (setting.key === 'preview_mode'
                  ? 'Preview mode is the cutover switch. Turning it OFF removes the preview banner AND lets platform emails reach non-admin users.'
                  : 'This takes effect immediately.')
              )
              if (!ok) return
              save(target, true)
            } else {
              save(!on)
            }
          }}
        />
        {on ? 'On' : 'Off'}
        {setting.confirm && <span className="pill gold">confirm-protected</span>}
      </label>
    )
  }

  const isNumeric = setting.type === 'int' || setting.type === 'number_or_null'
  return (
    <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {setting.type === 'number_or_null' && setting.unset && (
        <span className="pill red">not set</span>
      )}
      <input
        className="plat-input"
        style={{ marginBottom: 0, maxWidth: 220, padding: '5px 8px', fontSize: 13 }}
        type={isNumeric ? 'number' : 'text'}
        step={setting.type === 'number_or_null' ? '0.1' : undefined}
        placeholder={setting.type === 'number_or_null' ? 'not set' : ''}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button
        className="plat-btn ghost"
        disabled={saving}
        onClick={() => {
          if (setting.type === 'int') {
            const n = parseInt(draft, 10)
            if (Number.isNaN(n)) { onError(`${setting.label} must be a whole number`); return }
            save(n)
          } else if (setting.type === 'number_or_null') {
            if (draft.trim() === '') { save(null); return }
            const n = parseFloat(draft)
            if (Number.isNaN(n)) { onError(`${setting.label} must be a number`); return }
            save(n)
          } else {
            save(draft)
          }
        }}
      >
        {saving ? '…' : 'Save'}
      </button>
      {setting.type === 'number_or_null' && !setting.unset && (
        <button className="plat-btn ghost" disabled={saving} onClick={() => { setDraft(''); save(null) }}>
          Clear
        </button>
      )}
    </span>
  )
}

export function Admin() {
  const [settings, setSettings] = useState<SettingRow[]>([])
  const [emails, setEmails] = useState<EmailLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    Promise.all([api.settings(), api.emailLog()])
      .then(([s, e]) => {
        setSettings(s.settings)
        setEmails(e.emails)
        setError('')
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="admin-loading">Loading…</div>

  return (
    <div className="admin-page">
      <h1 className="admin-title bebas">Settings</h1>
      <div className="panel" style={{ marginBottom: 20 }}>
        <table className="plat-table">
          <thead><tr><th>Setting</th><th>Value</th></tr></thead>
          <tbody>
            {settings.map((s) => (
              <tr key={s.key}>
                <td style={{ width: 260 }}>
                  <b>{s.label}</b>
                  <div className="note" style={{ marginTop: 2 }}>{s.key}</div>
                </td>
                <td><SettingEditor key={`${s.key}:${JSON.stringify(s.value)}`} setting={s} onSaved={load} onError={setError} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="note">
          Settings are rows, not constants (§4). commission_default drives the commission
          report. Until it is set, deals without their own percent stay uncounted.
        </div>
      </div>

      <h1 className="admin-title bebas">Email log</h1>
      <div className="panel" style={{ marginBottom: 20 }}>
        {emails.length === 0 ? (
          <div className="note">No sends yet.</div>
        ) : (
          <table className="plat-table">
            <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Context</th><th>Status</th></tr></thead>
            <tbody>
              {emails.map((e, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                  <td>{e.to_email}</td>
                  <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject}</td>
                  <td>{e.context ?? '—'}</td>
                  <td>
                    <span className={`pill ${e.status === 'sent' ? 'green' : e.status === 'suppressed' ? 'gold' : 'red'}`}>{e.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="note">
          While preview mode is on, only admin users receive real email. Everything else is
          suppressed and recorded here, so cutover traffic is previewable.
        </div>
      </div>

      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}

      <UserManagement />
    </div>
  )
}
