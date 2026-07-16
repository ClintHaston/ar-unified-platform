import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Icon } from '../components/shell/icons'
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
import { companyTz, todayIn } from '../components/reports/companyTz'

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

// Quick date presets. days = days back from today (open-ended, no end bound),
// or null for all-time. Today is the odd one out: a BOUNDED single day in the
// company timezone, so it carries its own flag instead of faking a days offset.
type Preset = { label: string; days: number | null; today?: boolean }
const PRESETS: Preset[] = [
  { label: 'Today', days: null, today: true },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '12mo', days: 365 },
  { label: 'All', days: null },
]

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function Reports() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [tab, setTab] = useState<TabKey>('sell')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [owners, setOwners] = useState<OwnerOption[]>([])

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
    if (!isAdmin || tab === 'custom' || tab === 'dashboards') return   // these fetch their own data
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

  if (!isAdmin) {
    return (
      <div className="ws-placeholder">
        <div className="ws-ph-ic"><Icon name="reports" size={26} /></div>
        <h2>Reports are admin-only</h2>
        <p>Ask an admin for pipeline funnels, deal, and call reporting.</p>
      </div>
    )
  }

  async function applyPreset(p: Preset) {
    if (p.today) {
      // Today = start and end BOTH set to today's date in the company timezone.
      // The server reads those dates in that same timezone, so the window runs
      // local midnight to local midnight rather than cutting the day at UTC.
      const d = todayIn(await companyTz())
      setStart(d)
      setEnd(d)
      return
    }
    setEnd('')
    setStart(p.days === null ? '' : isoDaysAgo(p.days))
  }

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
          <Link to="/commission" className="plat-btn ghost" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
            Commission report →
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--p-body)' }}>From</span>
          <input type="date" className="plat-input" style={{ marginBottom: 0, width: 'auto' }}
                 value={start} onChange={(e) => setStart(e.target.value)} />
          <span style={{ fontSize: 12, color: 'var(--p-body)' }}>to</span>
          <input type="date" className="plat-input" style={{ marginBottom: 0, width: 'auto' }}
                 value={end} onChange={(e) => setEnd(e.target.value)} />
          <div className="roletoggle">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => { void applyPreset(p) }}>{p.label}</button>
            ))}
          </div>
          <select className="plat-input" style={{ marginBottom: 0, width: 'auto', maxWidth: 200 }}
                  value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">All reps</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.is_active ? o.name : `${o.name} (inactive)`}</option>
            ))}
          </select>
        </div>
      </div>

      {tab !== 'custom' && tab !== 'dashboards' && error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      {tab !== 'custom' && tab !== 'dashboards' && loading && <div className="admin-loading">Loading report…</div>}

      {tab === 'custom' && <ReportBuilder start={start} end={end} ownerId={ownerId} />}
      {tab === 'dashboards' && <DashboardsPanel start={start} end={end} ownerId={ownerId} />}

      {!loading && tab === 'sell' && sell && (
        sell.pipelines.length === 0
          ? <div className="note">No sell pipelines.</div>
          : sell.pipelines.map((p) => <Funnel key={p.pipeline_id} pipeline={p} accent="var(--p-gold)" />)
      )}
      {!loading && tab === 'buy' && buy && (
        buy.pipelines.length === 0
          ? <div className="note">No buy pipeline.</div>
          : buy.pipelines.map((p) => <Funnel key={p.pipeline_id} pipeline={p} accent="var(--p-buy)" />)
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
