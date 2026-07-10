import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  adminOnly?: boolean
}

// Rep-vs-admin routing (step 3c-1): every active user sees the tool tabs,
// admins additionally see Admin and Spine. A user flagged
// must_change_password is gated to the change-password screen first.
export function AuthGuard({ children, adminOnly }: Props) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: 'var(--text-muted)' }}>Loading…</span>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  if (adminOnly && user.role !== 'admin') {
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
