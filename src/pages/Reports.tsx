import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  api,
  type CallActivityReport,
  type DealsByRepReport,
  type FunnelReport,
  type OwnerOption,
  type ReportFilters,
} from '../lib/api'
import { Funnel } from '../components/reports/Funnel'
import { DealsByRepTable } from '../components/reports/DealsByRepTable'
import { CallActivityTable } from '../components/reports/CallActivityTable'
import { ReportBuilder } from '../components/reports/ReportBuilder'
import { DashboardsPanel } from '../components/reports/DashboardsPanel'
import { DatePresets } from '../components/reports/DatePresets'

// WS2a reporting hub — calls + sales + funnels, the data we fully own. Admin
// only (data endpoints 403 for reps); reps see a friendly pointer. Every tab
// shares the date-range + owner filters. WS2b adds the Custom builder tab.
// Email-open reporting is v2.

type TabKey = 'sell' | 'buy' | 'deals' | 'calls' | 'custom' | 'dashboards'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'sell', label: 'Sell funnel' },
  { key: 'buy', label: 'Buy funnel' },
  { key: 'deals', label: 'Deals by rep' },
  { key: 'calls', label: 'Calls' },
  { key: 'custom', label: 'Custom' },
  { key: 'dashboards', label: 'Dashboards' },
]

// The date presets are DatePresets now (MYDAY_POLISH): Today / Yesterday /
// This week / Last week / Custom, all bounded and all computed in the company
// timezone. The rolling 30d/90d/12mo/All row it replaces is gone from both
// surfaces that carried it, so there is one preset vocabulary in the app.

function isTabKey(v: string | null): v is TabKey {
  return TABS.some((t) => t.key === v)
}

export function Reports() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  // ?tab= deep-links each report tab, so the sidebar Reports flyout can land
  // directly on Custom, Dashboards, etc. State stays local after the landing.
  const [searchParams] = useSearchParams()
  const paramTab = searchParams.get('tab')
  const [tab, setTab] = useState<TabKey>(isTabKey(paramTab) ? paramTab : 'sell')
  useEffect(() => { if (isTabKey(paramTab)) setTab(paramTab) }, [paramTab])

  // ?from= is the dashboard that sent us here to build a chart (My Day v3).
  // Only an in-app path is honoured: a `from` pointing anywhere else would turn
  // this into an open redirect, and the only legitimate value is a route in
  // this app.
  const fromParam = searchParams.get('from')
  const returnTo = fromParam && /^\/[^/\\]/.test(fromParam) ? fromParam : null
  // ?edit=<saved report id> is a panel's "Edit chart" (MYDAY_POLISH). Only a
  // uuid is honoured — the builder looks it up in the saved list it can see,
  // so anything else simply finds nothing, but refusing it here keeps a junk
  // value out of the component's state in the first place.
  const editParam = searchParams.get('edit')
  const editId = editParam && /^[0-9a-f-]{36}$/i.test(editParam) ? editParam : undefined
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [owners, setOwners] = useState<OwnerOption[]>([])
  // "Custom" is the from/to inputs, so pressing it puts the cursor in one.
  const fromRef = useRef<HTMLInputElement>(null)

  const [sell, setSell] = useState<FunnelReport | null>(null)
  const [buy, setBuy] = useState<FunnelReport | null>(null)
  const [deals, setDeals] = useState<DealsByRepReport | null>(null)
  const [calls, setCalls] = useState<CallActivityReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    api.contactOwners().then((res) => setOwners(res.owners)).catch(() => setOwners([]))
  }, [isAdmin])

  useEffect(() => {
    if (tab === 'custom' || tab === 'dashboards') return   // these fetch their own data
    const filters: ReportFilters = {
      start: start || undefined,
      end: end || undefined,
      owner_id: ownerId || undefined,
    }
    let live = true
    setLoading(true)
    setError('')
    const run = async () => {
      try {
        if (tab === 'sell') setSell(await api.sellFunnel(filters))
        else if (tab === 'buy') setBuy(await api.buyFunnel(filters))
        else if (tab === 'deals') setDeals(await api.dealsByRep(filters))
        else if (tab === 'calls') setCalls(await api.callActivity(filters))
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Failed to load report')
      } finally {
        if (live) setLoading(false)
      }
    }
    run()
    return () => { live = false }
  }, [isAdmin, tab, start, end, ownerId])

  // Reps land here too now (2026-08-02 rep-dashboards build). The server pins
  // every rep query to owner = self, so this page shows a rep their own book —
  // the UI just stops pretending there is a choice (owner select is admin-only).

  return (
    <div>
      <div className="panel" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="roletoggle">
            {TABS.map((t) => (
              <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          {isAdmin && <Link to="/commission" className="plat-btn ghost" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
            Commission report →
          </Link>}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--p-body)' }}>From</span>
          <input ref={fromRef} type="date" className="plat-input"
                 style={{ marginBottom: 0, width: 'auto' }}
                 value={start} onChange={(e) => setStart(e.target.value)} />
          <span style={{ fontSize: 12, color: 'var(--p-body)' }}>to</span>
          <input type="date" className="plat-input" style={{ marginBottom: 0, width: 'auto' }}
                 value={end} onChange={(e) => setEnd(e.target.value)} />
          <DatePresets start={start} end={end}
                       onChange={(r) => { setStart(r.start); setEnd(r.end) }}
                       onCustom={() => fromRef.current?.focus()} />
          {isAdmin ? (
            <select className="plat-input" style={{ marginBottom: 0, width: 'auto', maxWidth: 200 }}
                    value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">All reps</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>{o.is_active ? o.name : `${o.name} (inactive)`}</option>
              ))}
            </select>
          ) : (
            <span className="pill" title="Your reports always show your own book">Mine</span>
          )}
        </div>
      </div>

      {tab !== 'custom' && tab !== 'dashboards' && error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      {tab !== 'custom' && tab !== 'dashboards' && loading && <div className="admin-loading">Loading report…</div>}

      {tab === 'custom' && (
        <>
          {returnTo && (
            <div className="note rb-from">
              {editId
                ? 'Editing a chart from a dashboard — saving it will take you '
                  + 'back and the panel will show the change. '
                : 'Building a chart for a dashboard — saving it will take you '
                  + 'back and drop it on the board. '}
              <Link to={returnTo}>Go back without saving</Link>
            </div>
          )}
          <ReportBuilder start={start} end={end} ownerId={ownerId}
                         returnTo={returnTo ?? undefined} editId={editId} />
        </>
      )}
      {tab === 'dashboards' && <DashboardsPanel start={start} end={end} ownerId={ownerId} />}

      {!loading && tab === 'sell' && sell && (
        sell.pipelines.length === 0
          ? <div className="note">No sell pipelines.</div>
          // The same filters the funnel above was run with ride into the stage
          // drill, so the popup lists the book the bars were drawn from. The
          // server re-scopes a rep to self regardless.
          : sell.pipelines.map((p) => (
              <Funnel key={p.pipeline_id} pipeline={p} accent="var(--p-gold)"
                      start={start || undefined} end={end || undefined}
                      ownerId={ownerId || undefined} />
            ))
      )}
      {!loading && tab === 'buy' && buy && (
        buy.pipelines.length === 0
          ? <div className="note">No buy pipeline.</div>
          : buy.pipelines.map((p) => (
              <Funnel key={p.pipeline_id} pipeline={p} accent="var(--p-buy)"
                      start={start || undefined} end={end || undefined}
                      ownerId={ownerId || undefined} />
            ))
      )}
      {!loading && tab === 'deals' && deals && <DealsByRepTable report={deals} />}
      {!loading && tab === 'calls' && calls && <CallActivityTable report={calls} />}

      {tab !== 'custom' && tab !== 'dashboards' && (
        <div className="note" style={{ marginTop: 10 }}>
          Reporting v1 covers calls, sales, and funnels. Numbers are honest to the data.
          Where history is thin (no closed-won yet, calls without outcomes), the report shows it.
        </div>
      )}
    </div>
  )
}
