import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api, type DashboardListItem } from '../lib/api'

// The landing route ("/"), which is where Login sends every user.
//
// It answers one question: which dashboard does THIS user land on? It never
// renders a page of its own.
//
// FALLBACK ORDER (MYDAY_POLISH, 2026-08-04):
//   1. the user's EXPLICIT default, if they set one
//   2. their own My Day — which exists for everyone, because listing
//      dashboards provisions it server-side
//   3. the static KPI page (/dashboard), only if neither resolves
//
// Step 2 is the change. Opening the app used to land anyone who had never
// pressed "Set as default" on the static KPI page, which is the one dashboard
// that is NOT theirs: no tasks, no goal, no feed, nobody's book in particular.
// My Day is the screen this whole build exists for and it is provisioned for
// every rep and admin, so landing anywhere else by default was the app
// forgetting its own front door.
//
// Graceful degradation is still the point, and every failure lands somewhere
// safe: no My Day (a role that is not provisioned one), a resolve call that
// fails, a list call that fails — all of them fall through to /dashboard.
// The dangling case is resolved server-side (a soft-deleted dashboard comes
// back as null), so there is no dangling id to mishandle here.
//
// /dashboard stays the static KPI page ALWAYS. It is the labelled fallback and
// the sidebar's target, so it has to be predictable and bookmarkable.

const MY_DAY_KEY = 'my_day'

/** The caller's OWN My Day. Keyed on system_key, not on the name, because a
 *  rep may rename theirs — and matched on ownership too, since an admin sees
 *  every dashboard they are allowed to see and only one of them is theirs. */
export function findMyDay(dashboards: DashboardListItem[],
                          userId: string | undefined): DashboardListItem | undefined {
  return dashboards.find(
    (d) => d.system_key === MY_DAY_KEY && !!userId && d.owner_id === userId)
}

export function DashboardLanding() {
  const { user } = useAuth()
  const userId = user?.id
  const [to, setTo] = useState<string | null>(null)

  useEffect(() => {
    // AuthGuard has already restored the session, but hold rather than resolve
    // against an undefined id — deciding "no My Day" because the user had not
    // loaded yet would land everyone on the static page.
    if (!userId) return
    // The list call comes first for two reasons: it provisions a brand-new
    // rep's My Day server-side, and it is what step 2 resolves against.
    let live = true
    api.dashboards()
      .then(async (list) => {
        const explicit = await api.defaultDashboard()
          .then((r) => r.default?.dashboard_id ?? null)
          .catch(() => null)
        if (!live) return
        if (explicit) { setTo(`/dashboards/${explicit}`); return }
        const mine = findMyDay(list.dashboards, userId)
        setTo(mine ? `/dashboards/${mine.id}` : '/dashboard')
      })
      .catch(() => { if (live) setTo('/dashboard') })
    return () => { live = false }
  }, [userId])

  // Hold rather than flash the KPI page and yank it away a moment later.
  if (to === null) return <div className="admin-loading">Loading…</div>
  return <Navigate to={to} replace />
}
