import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

// The landing route ("/"), which is where Login sends every user.
//
// It answers one question: which dashboard does THIS user land on? Either their
// chosen default, or the static KPI page. It never renders anything itself.
//
// Graceful degradation is the whole point, and every failure lands on the same
// safe place:
//   * no default set              -> the static KPI page (unchanged behaviour)
//   * default set                 -> that dashboard
//   * default points at a DELETED dashboard -> the static KPI page
//   * the resolve call fails      -> the static KPI page
// The dangling case is resolved server-side (a soft-deleted dashboard comes back
// as null), so there is no dangling id to mishandle here. The catch below is a
// second belt: a landing must never be a 404 or a blank.
//
// /dashboard stays the static KPI page ALWAYS. It is the labelled fallback and
// the sidebar's target, so it has to be predictable and bookmarkable.

export function DashboardLanding() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [to, setTo] = useState<string | null>(null)

  useEffect(() => {
    // Dashboards are admin-only, so a rep has no default by definition. Skip
    // the round-trip rather than ask on every rep's landing.
    if (!isAdmin) { setTo('/dashboard'); return }
    let live = true
    api.defaultDashboard()
      .then((r) => {
        if (!live) return
        setTo(r.default ? `/dashboards/${r.default.dashboard_id}` : '/dashboard')
      })
      .catch(() => { if (live) setTo('/dashboard') })
    return () => { live = false }
  }, [isAdmin])

  // Hold rather than flash the KPI page and yank it away a moment later.
  if (to === null) return <div className="admin-loading">Loading…</div>
  return <Navigate to={to} replace />
}
