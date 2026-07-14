import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  api, type DashboardFilters, type DashboardListItem, type DashboardPanel,
  type PanelSize, type SavedReport,
} from '../../lib/api'
import { useToast } from '../shell/ToastContext'
import { Icon } from '../shell/icons'

// WS2c dashboards tab: list existing dashboards (favorites first, from the
// server) and a builder that composes saved reports into panels. The shared
// Reports filter bar values become the dashboard's default filters on save.

interface Props {
  start: string
  end: string
  ownerId: string
}

export function DashboardsPanel({ start, end, ownerId }: Props) {
  const navigate = useNavigate()
  const toast = useToast()
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([])
  const [reports, setReports] = useState<SavedReport[]>([])
  const [loading, setLoading] = useState(true)

  const [building, setBuilding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [panels, setPanels] = useState<DashboardPanel[]>([])
  const [saving, setSaving] = useState(false)

  const reportName = useMemo(() => {
    const m: Record<string, string> = {}
    reports.forEach((r) => { m[r.id] = r.name })
    return m
  }, [reports])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([api.dashboards(), api.savedReports()])
      .then(([d, r]) => { setDashboards(d.dashboards); setReports(r.reports) })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function startNew() {
    setBuilding(true); setEditingId(null); setName(''); setPanels([])
  }

  function editDashboard(d: DashboardListItem) {
    setBuilding(true); setEditingId(d.id); setName(d.name); setPanels(d.layout ?? [])
  }

  function addPanel(reportId: string) {
    setPanels((cur) => [...cur, { saved_report_id: reportId, size: 'full' }])
  }
  function removePanel(i: number) {
    setPanels((cur) => cur.filter((_, idx) => idx !== i))
  }
  function move(i: number, dir: -1 | 1) {
    setPanels((cur) => {
      const j = i + dir
      if (j < 0 || j >= cur.length) return cur
      const next = [...cur]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function setSize(i: number, size: PanelSize) {
    setPanels((cur) => cur.map((p, idx) => (idx === i ? { ...p, size } : p)))
  }

  async function save() {
    if (!name.trim() || panels.length === 0) return
    const default_filters: DashboardFilters = {}
    if (start || end) default_filters.date = { start: start || undefined, end: end || undefined }
    if (ownerId) default_filters.owner_id = ownerId
    setSaving(true)
    try {
      if (editingId) {
        await api.updateDashboard(editingId, { name: name.trim(), layout: panels, default_filters })
        toast.info('Dashboard updated', name.trim())
      } else {
        await api.createDashboard({ name: name.trim(), layout: panels, default_filters })
        toast.info('Dashboard saved', name.trim())
      }
      setBuilding(false); setEditingId(null); setName(''); setPanels([])
      load()
    } catch (e) {
      toast.error('Save failed', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(d: DashboardListItem) {
    try { await api.deleteDashboard(d.id); load(); toast.info('Dashboard deleted', d.name) }
    catch (e) { toast.error('Delete failed', e instanceof Error ? e.message : 'Please try again.') }
  }

  async function toggleFav(d: DashboardListItem) {
    // optimistic
    setDashboards((cur) => cur.map((x) => (x.id === d.id ? { ...x, favorited: !x.favorited } : x)))
    try {
      if (d.favorited) await api.unfavoriteDashboard(d.id)
      else await api.favoriteDashboard(d.id)
      load()
    } catch {
      setDashboards((cur) => cur.map((x) => (x.id === d.id ? { ...x, favorited: d.favorited } : x)))
    }
  }

  if (loading) return <div className="admin-loading">Loading dashboards…</div>

  if (building) {
    return (
      <div className="panel">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input className="plat-input" style={{ marginBottom: 0, flex: 1, maxWidth: 320 }}
                 placeholder="Dashboard name…" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="plat-btn" disabled={saving || !name.trim() || panels.length === 0} onClick={save}>
            {saving ? 'Saving…' : editingId ? 'Update dashboard' : 'Save dashboard'}
          </button>
          <button className="plat-btn ghost" onClick={() => setBuilding(false)}>Cancel</button>
        </div>

        <div className="dash-build-grid">
          <div>
            <div className="rb-lbl">Add a saved report</div>
            {reports.length === 0 ? (
              <div className="note">No saved reports yet. Build one in the Custom tab first.</div>
            ) : (
              <div className="rb-chips">
                {reports.map((r) => (
                  <button key={r.id} className="rb-chip" onClick={() => addPanel(r.id)}>+ {r.name}</button>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="rb-lbl">Panels ({panels.length})</div>
            {panels.length === 0 ? (
              <div className="note">Add saved reports to build this dashboard.</div>
            ) : (
              panels.map((p, i) => (
                <div key={`${p.saved_report_id}-${i}`} className="dash-panel-row">
                  <span style={{ flex: 1, fontSize: 13 }}>{reportName[p.saved_report_id] ?? '(unknown report)'}</span>
                  <div className="roletoggle">
                    <button className={p.size === 'full' ? 'active' : ''} onClick={() => setSize(i, 'full')}>Full</button>
                    <button className={p.size === 'half' ? 'active' : ''} onClick={() => setSize(i, 'half')}>Half</button>
                  </div>
                  <button className="plat-btn ghost" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
                  <button className="plat-btn ghost" onClick={() => move(i, 1)} disabled={i === panels.length - 1} title="Move down">↓</button>
                  <button className="plat-btn ghost" onClick={() => removePanel(i)}>Remove</button>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="note" style={{ marginTop: 10 }}>
          The date range and owner in the filter bar above become this dashboard's default filters.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <b style={{ fontSize: 14 }}>Dashboards</b>
        <button className="plat-btn" style={{ marginLeft: 'auto' }} onClick={startNew}>+ New dashboard</button>
      </div>
      {dashboards.length === 0 ? (
        <div className="panel"><div className="note">No dashboards yet. Create one from your saved reports.</div></div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          {dashboards.map((d) => (
            <div key={d.id} className="dash-list-row">
              <button className="ws-star" onClick={() => toggleFav(d)} aria-pressed={d.favorited}
                      title={d.favorited ? 'Unfavorite' : 'Favorite'}>
                <Icon name={d.favorited ? 'star-filled' : 'star'} size={16} />
              </button>
              <button className="dash-list-name" onClick={() => navigate(`/dashboards/${d.id}`)}>{d.name}</button>
              <span className="note">{d.panel_count} panel{d.panel_count === 1 ? '' : 's'}</span>
              <span className="note">{d.owner_name ?? '—'}</span>
              <button className="plat-btn ghost" onClick={() => editDashboard(d)}>Edit</button>
              <button className="plat-btn ghost" onClick={() => remove(d)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
