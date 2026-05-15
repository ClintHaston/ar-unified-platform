import { useEffect, useState } from 'react'
import { api, type User } from '../lib/api'

const TAB_KEYS = [
  { key: 'evaluator', label: 'Evaluator' },
  { key: 'deals', label: 'Deals' },
  { key: 'leads', label: 'Lead Intelligence' },
  { key: 'sales_command', label: 'Sales Command' },
]

interface UserRow extends User {
  permissions: Record<string, boolean>
}

export function Admin() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    api.adminGetAllPermissions()
      .then((res) => setUsers(res.users))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function togglePermission(userId: number, tabKey: string, current: boolean) {
    const key = `${userId}-${tabKey}`
    setSaving(key)
    try {
      await api.adminSetPermission(userId, tabKey, !current)
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, permissions: { ...u.permissions, [tabKey]: !current } }
            : u
        )
      )
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <div className="admin-loading">Loading users…</div>

  return (
    <div className="admin-page">
      <h1 className="admin-title bebas">Tab Access Control</h1>
      <table className="admin-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            {TAB_KEYS.map((t) => (
              <th key={t.key}>{t.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{user.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{user.email}</div>
              </td>
              <td>
                <span className={`badge-role ${user.role}`}>{user.role}</span>
              </td>
              {TAB_KEYS.map((tab) => {
                const granted = user.permissions[tab.key] ?? false
                const key = `${user.id}-${tab.key}`
                return (
                  <td key={tab.key}>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={granted}
                        disabled={saving === key}
                        onChange={() => togglePermission(user.id, tab.key, granted)}
                      />
                    </label>
                    {saving === key && (
                      <span className="save-indicator">saving…</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
