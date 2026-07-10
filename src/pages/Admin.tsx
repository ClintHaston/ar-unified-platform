import { useEffect, useState } from 'react'
import { api } from '../lib/api'

interface RosterUser {
  id: string
  email: string
  name: string
  role: string
  is_active: boolean
  must_change_password: boolean
  created_at: string
}

// Step 3c-1: tab-level permission toggles retired with the legacy auth —
// access is rep-vs-admin by role now. This screen is the platform.users
// roster; role editing lands with the user-management build step.
export function Admin() {
  const [users, setUsers] = useState<RosterUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.listUsers()
      .then((res) => setUsers(res.users))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="admin-loading">Loading users…</div>
  if (error) return <div className="admin-loading">{error}</div>

  return (
    <div className="admin-page">
      <h1 className="admin-title bebas">Platform Users</h1>
      <table className="admin-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Status</th>
            <th>Password</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{u.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{u.email}</div>
              </td>
              <td>
                <span className={`badge-role ${u.role}`}>{u.role}</span>
              </td>
              <td>{u.is_active ? 'Active' : 'Inactive'}</td>
              <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {u.must_change_password ? 'Change required at next login' : 'Set'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
