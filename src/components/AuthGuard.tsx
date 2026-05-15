import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  tabKey?: string
  adminOnly?: boolean
}

export function AuthGuard({ children, tabKey, adminOnly }: Props) {
  const { user, permissions, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: 'var(--text-muted)' }}>Loading…</span>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (adminOnly && user.role !== 'admin' && user.role !== 'owner') {
    return <AccessDenied />
  }

  if (tabKey && !permissions[tabKey]) {
    return <AccessDenied />
  }

  return <>{children}</>
}

function AccessDenied() {
  return (
    <div className="access-denied" style={{ paddingTop: 80 }}>
      <h2>Access Restricted</h2>
      <p>You don't have permission to view this tab. Contact an admin.</p>
    </div>
  )
}
