import { useCallback, useEffect, useState } from 'react'
import { api, type PlatformUser } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

// Task B: admin user management (Settings > Team). This is what gives reps
// logins at cutover. Admin-only (the backend returns 403 for reps; this screen
// already sits behind the admin nav gate). Every action is server-audited.

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

export function UserManagement() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [temp, setTemp] = useState<{ title: string; password: string } | null>(null)

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
            <label style={{ fontSize: 12 }}>Role
              <select className="plat-input" style={{ display: 'block', marginTop: 3 }}
                value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="rep">rep</option>
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
        </div>
      )}

      <div className="panel">
        <table className="plat-table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Status</th>
              <th>Last Active</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const st = statusLabel(u)
              const isSelf = me?.id === u.id
              const busy = busyId === u.id
              return (
                <tr key={u.id}>
                  <td><b>{u.name}</b>{isSelf && <span className="note" style={{ marginLeft: 6 }}>(you)</span>}</td>
                  <td>{u.email}</td>
                  <td><span className={`badge-role ${u.role}`}>{u.role}</span></td>
                  <td><span className={`pill ${st.cls}`}>{st.text}</span></td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--p-body)', fontSize: 12 }}>{lastActive(u.last_active)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="plat-btn ghost" disabled={busy} onClick={() => resetPw(u)}>Reset password</button>
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

      {error && <div className="note" style={{ color: '#B4432B', marginTop: 8 }}>{error}</div>}
    </div>
  )
}
