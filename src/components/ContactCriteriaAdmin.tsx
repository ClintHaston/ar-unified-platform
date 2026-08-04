import { useCallback, useEffect, useState } from 'react'
import { api, type ContactCriteriaKind, type ContactCriteriaOption } from '../lib/api'

// Settings editor for the two buyer-need option lists. THIS is what makes
// "admin-editable without a deploy" true rather than merely API-shaped: an
// admin adds "Telehandler" here and every contact form offers it on its next
// load.
//
// Two rules the UI has to make legible, because both protect data:
//   * RENAMING changes the LABEL only. The stored value is a stable slug and
//     is not editable at all — changing it would orphan every contact already
//     carrying it. So a rename is safe and is presented as safe.
//   * RETIRING archives. Contacts that already carry the option keep showing
//     it and keep matching filters; it just stops being offered on new forms.
//     That is why the button says "Retire" and not "Delete".

const KINDS: Array<{ kind: ContactCriteriaKind; title: string; hint: string }> = [
  { kind: 'industry', title: 'Industries',
    hint: "Seeded with the website's six parent industries." },
  { kind: 'equipment_type', title: 'Equipment types',
    hint: 'The shapes reps actually get asked for. Extend freely.' },
]

export function ContactCriteriaAdmin() {
  const [options, setOptions] = useState<ContactCriteriaOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [adding, setAdding] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setLoading(true)
    api.contactCriteriaOptions()
      .then((r) => { setOptions(r.options); setError('') })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load options'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function add(kind: ContactCriteriaKind) {
    const label = (adding[kind] ?? '').trim()
    if (!label) return
    setBusy(`add:${kind}`)
    try {
      await api.createContactCriteriaOption({ kind, label })
      setAdding({ ...adding, [kind]: '' })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that option')
    } finally {
      setBusy('')
    }
  }

  async function rename(o: ContactCriteriaOption, label: string) {
    if (label.trim() === o.label || !label.trim()) return
    setBusy(o.id)
    try {
      await api.updateContactCriteriaOption(o.id, { label: label.trim() })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename that option')
      load()
    } finally {
      setBusy('')
    }
  }

  async function retire(o: ContactCriteriaOption) {
    setBusy(o.id)
    try {
      await api.updateContactCriteriaOption(o.id, { archived: true })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not retire that option')
    } finally {
      setBusy('')
    }
  }

  if (loading) return <div className="admin-loading">Loading options…</div>

  return (
    <>
      <h1 className="admin-title bebas">Buyer-need criteria</h1>
      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="cca-grid">
          {KINDS.map(({ kind, title, hint }) => {
            const rows = options.filter((o) => o.kind === kind)
            return (
              <div key={kind}>
                <div className="cca-head">{title}</div>
                <div className="note" style={{ marginBottom: 6 }}>{hint}</div>
                <table className="plat-table">
                  <thead>
                    <tr><th>Label</th><th style={{ width: 150 }}>Stored value</th><th style={{ width: 80 }}></th></tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => (
                      <tr key={o.id}>
                        <td>
                          {/* Uncontrolled + commit on blur: a controlled input
                              would PATCH on every keystroke. */}
                          <input className="plat-input" style={{ marginBottom: 0 }}
                                 defaultValue={o.label} disabled={busy === o.id}
                                 onBlur={(e) => { void rename(o, e.target.value) }}
                                 onKeyDown={(e) => {
                                   if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                 }} />
                        </td>
                        <td><code className="cca-slug">{o.value}</code></td>
                        <td>
                          <button className="plat-btn ghost" disabled={busy === o.id}
                                  onClick={() => { void retire(o) }}
                                  title="Stop offering this on new contacts. Contacts that already have it keep it.">
                            Retire
                          </button>
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={3}><span className="note">No options yet.</span></td></tr>
                    )}
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input className="plat-input" style={{ marginBottom: 0, flex: 1 }}
                         placeholder={`Add a ${kind === 'industry' ? 'industry' : 'type'}…`}
                         value={adding[kind] ?? ''}
                         onChange={(e) => setAdding({ ...adding, [kind]: e.target.value })}
                         onKeyDown={(e) => { if (e.key === 'Enter') void add(kind) }} />
                  <button className="plat-btn" disabled={busy === `add:${kind}`}
                          onClick={() => { void add(kind) }}>Add</button>
                </div>
              </div>
            )
          })}
        </div>
        <div className="note" style={{ marginTop: 12 }}>
          These lists are data, not code — changes take effect immediately, with no
          deploy. Renaming changes only the label: contacts store the stored value,
          so every contact keeps its criteria. <b>Retire</b> stops offering an option
          on new contacts; contacts that already carry it keep showing it and keep
          matching list filters.
        </div>
      </div>
    </>
  )
}
