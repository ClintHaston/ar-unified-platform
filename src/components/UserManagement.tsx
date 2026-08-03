import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type PlatformUser } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { SortableTh, useClientSort, type ClientSortColumn } from './SortableTh'
import { Mailto } from './quicklog/Contactable'
import { TargetsModal } from './reports/TargetsForm'

// Task B: admin user management (Settings > Team). This is what gives reps
// logins at cutover. Admin-only (the backend returns 403 for reps; this screen
// already sits behind the admin nav gate). Every action is server-audited.
//
// DRILL_USERS (2026-08-03), two changes:
//
//   * ROLE IS LOUD. An accidental admin is the failure mode that matters here
//     — an admin sees every rep's book — so the role reads as a badge on every
//     row and an admin row is called out in words next to it. New users are
//     reps; the Add form says so and the server defaults to it regardless.
//   * REMOVE / REACTIVATE. Removal is soft and the confirm dialog says exactly
//     what that means, because "Remove" reads as "delete" to everybody and the
//     one thing this must not do is destroy the record of someone's work.
//     Removed users live in a collapsed section so the roster stays about the
//     people who work here, while a removal is still undoable.

function TempPasswordCard({ title, password, onDone }: {
  title: string
  password: string
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="panel" style={{ marginBottom: 16, borderLeft: '4px solid var(--p-gold)' }}>
      <b>{title}</b>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0', flexWrap: 'wrap' }}>
        <code style={{
          fontFamily: 'monospace', fontSize: 15, padding: '6px 10px',
          background: 'var(--p-row)', borderRadius: 6, letterSpacing: 0.5,
        }}>{password}</code>
        <button
          className="plat-btn ghost"
          onClick={() => {
            navigator.clipboard.writeText(password).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="plat-btn" onClick={onDone}>Done</button>
      </div>
      <div className="note">
        This password is shown once. The user must set a new password at first login.
      </div>
    </div>
  )
}

function statusLabel(u: PlatformUser): { text: string; cls: string } {
  // Removed outranks inactive: a removed user is also inactive, and reading
  // "Inactive" next to a Reactivate button would understate what happened.
  if (u.is_removed) return { text: 'Removed', cls: 'red' }
  if (!u.is_active) return { text: 'Inactive', cls: 'red' }
  if (u.locked_until && new Date(u.locked_until).getTime() > Date.now()) {
    return { text: 'Locked', cls: 'gold' }
  }
  return { text: 'Active', cls: 'green' }
}

function lastActive(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function shortDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined,
    { month: 'short', day: 'numeric', year: 'numeric' })
}

// What "Remove" actually does, in the dialog, before it happens. "Remove"
// reads as "delete" to everyone, and the one thing this must not do is destroy
// the record of someone's work — so the confirm spells it out rather than
// asking "are you sure?" about a word the admin may be reading wrong.
function removalWarning(name: string): string {
  return [
    `Remove ${name}?`,
    '',
    '• They can no longer sign in — any open session ends immediately.',
    '• NOTHING is deleted. Their calls, emails, notes, deals and tasks keep',
    '  their name on them, and the history still reads the same.',
    '• They disappear from owner pickers, so nobody new can be assigned to',
    '  them. Records they already own stay theirs until you reassign them.',
    '• You can bring them back at any time with Reactivate.',
  ].join('\n')
}

const USER_SORT_COLS: ClientSortColumn<PlatformUser>[] = [
  { key: 'name', value: (u) => u.name },
  { key: 'email', value: (u) => u.email },
  { key: 'role', value: (u) => u.role },
  { key: 'status', value: (u) => statusLabel(u).text },
  { key: 'last_active', value: (u) => u.last_active, descFirst: true },
]

export function UserManagement() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<PlatformUser[]>([])
  // Removed users are filed separately, so only the working roster is sortable
  // — sorting a list you have to expand to see is a control with no subject.
  const active = useMemo(() => users.filter((u) => !u.is_removed), [users])
  const removed = useMemo(() => users.filter((u) => u.is_removed), [users])
  const userSort = useClientSort(active, USER_SORT_COLS)
  const [showRemoved, setShowRemoved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [temp, setTemp] = useState<{ title: string; password: string } | null>(null)
  // Whose goal targets are being edited (My Day v3). Targets are set FOR a
  // person BY an admin, so Settings > Team is their discoverable home — the
  // gauge's own inline editor is the shortcut, not the only door.
  const [targetsFor, setTargetsFor] = useState<PlatformUser | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('rep')
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    api.adminUsers()
      .then((r) => { setUsers(r.users); setError('') })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function submitAdd() {
    if (!email.trim() || !name.trim()) { setError('Email and name are required'); return }
    setAdding(true); setError('')
    try {
      const res = await api.createPlatformUser({ email: email.trim(), name: name.trim(), role })
      setTemp({ title: `Temporary password for ${res.user.name}`, password: res.temp_password })
      setShowAdd(false); setEmail(''); setName(''); setRole('rep')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user')
    } finally { setAdding(false) }
  }

  async function resetPw(u: PlatformUser) {
    setBusyId(u.id); setError('')
    try {
      const res = await api.resetPlatformUserPassword(u.id)
      setTemp({ title: `New temporary password for ${u.name}`, password: res.temp_password })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset password')
    } finally { setBusyId(null) }
  }

  async function changeRole(u: PlatformUser) {
    const next = u.role === 'admin' ? 'rep' : 'admin'
    if (!window.confirm(`Change ${u.name} from ${u.role} to ${next}? This signs them out immediately.`)) return
    setBusyId(u.id); setError('')
    try {
      await api.updatePlatformUser(u.id, { role: next })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change role')
    } finally { setBusyId(null) }
  }

  async function removeUser(u: PlatformUser) {
    if (!window.confirm(removalWarning(u.name))) return
    setBusyId(u.id); setError('')
    try {
      await api.removePlatformUser(u.id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove user')
    } finally { setBusyId(null) }
  }

  async function reactivate(u: PlatformUser) {
    // The same call that reactivates a merely-deactivated user. The server
    // clears archived_at on it, so there is one way back, not two.
    setBusyId(u.id); setError('')
    try {
      await api.updatePlatformUser(u.id, { is_active: true })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reactivate user')
    } finally { setBusyId(null) }
  }

  async function toggleActive(u: PlatformUser) {
    if (u.is_active && !window.confirm(
      `Deactivate ${u.name}? They are signed out immediately and cannot log in until reactivated.`
    )) return
    setBusyId(u.id); setError('')
    try {
      await api.updatePlatformUser(u.id, { is_active: !u.is_active })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user')
    } finally { setBusyId(null) }
  }

  if (loading) return <div className="admin-loading">Loading users…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <h1 className="admin-title bebas" style={{ margin: 0 }}>Team</h1>
        <button className="plat-btn" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Cancel' : '+ Add user'}
        </button>
      </div>

      {temp && (
        <TempPasswordCard title={temp.title} password={temp.password} onDone={() => setTemp(null)} />
      )}

      {showAdd && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12 }}>Email
              <input className="plat-input" style={{ display: 'block', marginTop: 3 }}
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rep@asset-resource.com" />
            </label>
            <label style={{ fontSize: 12 }}>Name
              <input className="plat-input" style={{ display: 'block', marginTop: 3 }}
                value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </label>
            {/* Rep is the default here AND on the server, which is the point:
                an admin has to be chosen, never arrived at. */}
            <label style={{ fontSize: 12 }}>Role
              <select className="plat-input" style={{ display: 'block', marginTop: 3 }}
                value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="rep">rep (default)</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <button className="plat-btn" disabled={adding} onClick={submitAdd}>
              {adding ? 'Creating…' : 'Create user'}
            </button>
          </div>
          <div className="note" style={{ marginTop: 6 }}>
            A one-time temporary password is generated. The user sets their own password at first login.
          </div>
          {role === 'admin' && (
            <div className="note" style={{ marginTop: 4, color: '#B4432B' }}>
              An admin sees <b>every rep's book</b> — all deals, contacts, calls
              and dashboards, company-wide. A rep only ever sees their own.
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <table className="plat-table">
          <thead>
            <tr>
              {[['name', 'Name'], ['email', 'Email'], ['role', 'Role'],
                ['status', 'Status'], ['last_active', 'Last Active']].map(([k, label]) => (
                <SortableTh key={k} colKey={k} sort={userSort.sort} dir={userSort.dir} toggle={userSort.toggle}>
                  {label}
                </SortableTh>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {userSort.sorted.map((u) => {
              const st = statusLabel(u)
              const isSelf = me?.id === u.id
              const busy = busyId === u.id
              return (
                <tr key={u.id}>
                  <td><b>{u.name}</b>{isSelf && <span className="note" style={{ marginLeft: 6 }}>(you)</span>}</td>
                  <td><Mailto email={u.email} /></td>
                  {/* Role, said twice on purpose. The badge is scannable; the
                      words next to it are what makes an accidental admin
                      obvious to someone who is not reading carefully. */}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className={`badge-role ${u.role}`}>{u.role}</span>
                    {u.role === 'admin' && (
                      <span className="note role-warn" title="Admins are not scoped to their own book">
                        sees all reps
                      </span>
                    )}
                  </td>
                  <td><span className={`pill ${st.cls}`}>{st.text}</span></td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--p-body)', fontSize: 12 }}>{lastActive(u.last_active)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="plat-btn ghost" disabled={busy} onClick={() => resetPw(u)}>Reset password</button>
                      <button className="plat-btn ghost" disabled={busy}
                              onClick={() => setTargetsFor(u)}
                              title="Monthly won-value and weekly call targets for their goal gauge">
                        Targets
                      </button>
                      {isSelf ? (
                        <span className="note" style={{ alignSelf: 'center' }}>Manage your own role elsewhere</span>
                      ) : (
                        <>
                          <button className="plat-btn ghost" disabled={busy} onClick={() => changeRole(u)}>
                            {u.role === 'admin' ? 'Make rep' : 'Make admin'}
                          </button>
                          <button className="plat-btn ghost" disabled={busy} onClick={() => toggleActive(u)}>
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button className="plat-btn ghost danger" disabled={busy}
                                  onClick={() => removeUser(u)}
                                  title="Block sign-in and take them off the team. Nothing they logged is deleted.">
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Removed users. Collapsed, because the roster should be about the
          people who work here — but present, because a removal that cannot be
          seen is a removal that cannot be undone. */}
      {removed.length > 0 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <button className="plat-btn ghost" aria-expanded={showRemoved}
                  onClick={() => setShowRemoved((v) => !v)}>
            {showRemoved ? '▾' : '▸'} Removed ({removed.length})
          </button>
          {showRemoved && (
            <>
              <div className="note" style={{ margin: '8px 0' }}>
                These people cannot sign in and do not appear in owner pickers.
                Everything they logged or own is still here with their name on it.
              </div>
              <table className="plat-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Email</th><th>Role</th><th>Removed</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {removed.map((u) => (
                    <tr key={u.id}>
                      <td><b>{u.name}</b></td>
                      <td><Mailto email={u.email} /></td>
                      <td><span className={`badge-role ${u.role}`}>{u.role}</span></td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--p-body)', fontSize: 12 }}>
                        {shortDate(u.archived_at)}
                      </td>
                      <td>
                        <button className="plat-btn ghost" disabled={busyId === u.id}
                                onClick={() => reactivate(u)}
                                title="Restore their login and put them back on the team">
                          Reactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {targetsFor && (
        <TargetsModal userId={targetsFor.id} userName={targetsFor.name}
                      onClose={() => setTargetsFor(null)} />
      )}

      {error && <div className="note" style={{ color: '#B4432B', marginTop: 8 }}>{error}</div>}
    </div>
  )
}
