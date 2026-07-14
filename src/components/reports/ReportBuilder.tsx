import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api, type RegistrySource, type ReportDefinition,
  type ReportViz, type RunResult, type SavedReport,
} from '../../lib/api'
import { useToast } from '../shell/ToastContext'
import { ResultView } from './ResultView'

// WS2b custom report builder. Every option offered here comes from the
// server-side registry (whitelist); the server is the hard backstop. Source ->
// dimensions + measures -> source filters -> viz -> live preview -> save.
// Date-range + owner come from the shared Reports filter bar (props).

interface Props {
  start: string
  end: string
  ownerId: string
}

const VIZ_LABEL: Record<ReportViz, string> = {
  table: 'Table', bar: 'Bar', number: 'Number', funnel: 'Funnel',
}

// Which viz needs what shape — mirrors the server's validation so the preview
// only fires on a runnable definition (the server still enforces).
function isRunnable(viz: ReportViz, dims: string[], measures: string[]): boolean {
  if (viz === 'funnel') return true
  if (viz === 'number') return dims.length === 0 && measures.length >= 1
  if (viz === 'bar') return dims.length === 1 && measures.length >= 1
  return dims.length >= 1 && measures.length >= 1   // table
}

function shapeHint(viz: ReportViz): string {
  if (viz === 'number') return 'Pick one or more measures (no dimensions).'
  if (viz === 'bar') return 'Pick exactly one dimension and at least one measure.'
  if (viz === 'table') return 'Pick at least one dimension and one measure.'
  return ''
}

export function ReportBuilder({ start, end, ownerId }: Props) {
  const toast = useToast()
  const [sources, setSources] = useState<RegistrySource[]>([])
  const [sourceKey, setSourceKey] = useState('')
  const [dims, setDims] = useState<string[]>([])
  const [measures, setMeasures] = useState<string[]>([])
  const [filters, setFilters] = useState<Record<string, string>>({})   // field -> value ('' = any)
  const [viz, setViz] = useState<ReportViz>('table')

  const [result, setResult] = useState<RunResult | null>(null)
  const [previewErr, setPreviewErr] = useState('')
  const [previewing, setPreviewing] = useState(false)

  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<SavedReport[]>([])

  const source = useMemo(() => sources.find((s) => s.key === sourceKey), [sources, sourceKey])
  const accent = sourceKey === 'buy_opps' ? 'var(--p-buy)' : 'var(--p-gold)'

  const loadSaved = useCallback(() => {
    api.savedReports().then((r) => setSaved(r.reports)).catch(() => setSaved([]))
  }, [])

  useEffect(() => {
    api.reportRegistry().then((r) => {
      setSources(r.sources)
      if (r.sources.length > 0 && !sourceKey) setSourceKey(r.sources[0].key)
    }).catch((e: unknown) => setPreviewErr(e instanceof Error ? e.message : 'Failed to load registry'))
    loadSaved()
  }, [loadSaved, sourceKey])

  // switching source resets the selection to a clean slate
  function chooseSource(key: string) {
    setSourceKey(key)
    setDims([]); setMeasures([]); setFilters({})
    const s = sources.find((x) => x.key === key)
    setViz(s && s.viz.includes('table') ? 'table' : (s?.viz[0] ?? 'table'))
    setResult(null); setPreviewErr(''); setEditingId(null); setName('')
  }

  const definition: ReportDefinition | null = useMemo(() => {
    if (!source) return null
    const clauses = Object.entries(filters)
      .filter(([, v]) => v !== '')
      .map(([field, value]) => ({ field, value }))
    return {
      source: source.key,
      dimensions: viz === 'funnel' ? [] : dims,
      measures: viz === 'funnel' ? [] : measures,
      filters: clauses,
      date: (start || end) ? { start: start || undefined, end: end || undefined } : undefined,
      owner_id: source.has_owner && ownerId ? ownerId : undefined,
      viz,
    }
  }, [source, dims, measures, filters, viz, start, end, ownerId])

  const ready = !!source && isRunnable(viz, viz === 'funnel' ? [] : dims, viz === 'funnel' ? [] : measures)

  // live preview, debounced
  useEffect(() => {
    if (!definition || !ready) { setResult(null); return }
    let live = true
    setPreviewing(true); setPreviewErr('')
    const t = setTimeout(() => {
      api.runReport(definition)
        .then((r) => { if (live) setResult(r) })
        .catch((e: unknown) => { if (live) { setResult(null); setPreviewErr(e instanceof Error ? e.message : 'Run failed') } })
        .finally(() => { if (live) setPreviewing(false) })
    }, 350)
    return () => { live = false; clearTimeout(t) }
  }, [definition, ready])

  function toggle(list: string[], setList: (v: string[]) => void, key: string) {
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key])
  }

  async function save() {
    if (!definition || !ready || !name.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        await api.updateSavedReport(editingId, { name: name.trim(), definition })
        toast.info('Report updated', name.trim())
      } else {
        const created = await api.createSavedReport(name.trim(), definition)
        setEditingId(created.id)
        toast.info('Report saved', name.trim())
      }
      loadSaved()
    } catch (e) {
      toast.error('Save failed', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function openSaved(r: SavedReport) {
    const d = r.definition
    setSourceKey(d.source)
    setDims(d.dimensions ?? [])
    setMeasures(d.measures ?? [])
    setFilters(Object.fromEntries((d.filters ?? []).map((f) => [f.field, f.value])))
    setViz(d.viz)
    setName(r.name)
    setEditingId(r.id)
    setResult(null); setPreviewErr('')
  }

  async function remove(r: SavedReport) {
    try {
      await api.deleteSavedReport(r.id)
      if (editingId === r.id) { setEditingId(null); setName('') }
      loadSaved()
      toast.info('Report deleted', r.name)
    } catch (e) {
      toast.error('Delete failed', e instanceof Error ? e.message : 'Please try again.')
    }
  }

  if (!source) return <div className="admin-loading">Loading builder…</div>

  const enumFilters = source.filters.filter((f) => f.type === 'enum' && f.options)

  return (
    <div className="rb-grid">
      <div className="rb-config panel">
        <label className="rb-lbl">Source</label>
        <select className="plat-input" value={sourceKey} onChange={(e) => chooseSource(e.target.value)}>
          {sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <label className="rb-lbl">Visualization</label>
        <div className="roletoggle" style={{ flexWrap: 'wrap' }}>
          {source.viz.map((v) => (
            <button key={v} className={viz === v ? 'active' : ''} onClick={() => setViz(v)}>{VIZ_LABEL[v]}</button>
          ))}
        </div>

        {viz === 'funnel' ? (
          <div className="note" style={{ marginTop: 10 }}>
            Funnel uses the stage progression for this source. Dimensions and measures do not apply.
          </div>
        ) : (
          <>
            <label className="rb-lbl">Dimensions (group by)</label>
            <div className="rb-chips">
              {source.dimensions.map((d) => (
                <button key={d.key} className={`rb-chip${dims.includes(d.key) ? ' on' : ''}`}
                        onClick={() => toggle(dims, setDims, d.key)}>{d.label}</button>
              ))}
            </div>
            <label className="rb-lbl">Measures</label>
            <div className="rb-chips">
              {source.measures.map((m) => (
                <button key={m.key} className={`rb-chip${measures.includes(m.key) ? ' on' : ''}`}
                        onClick={() => toggle(measures, setMeasures, m.key)}>{m.label}</button>
              ))}
            </div>
          </>
        )}

        {enumFilters.length > 0 && (
          <>
            <label className="rb-lbl">Filters</label>
            {enumFilters.map((f) => (
              <select key={f.key} className="plat-input" value={filters[f.key] ?? ''}
                      onChange={(e) => setFilters((cur) => ({ ...cur, [f.key]: e.target.value }))}>
                <option value="">{f.label}: any</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
          </>
        )}
        <div className="note" style={{ marginTop: 8 }}>
          Date range and owner come from the filter bar above.
          {!source.has_owner && ' This source has no owner, so the owner filter is ignored.'}
        </div>

        <div className="rb-save">
          <input className="plat-input" placeholder="Report name…" value={name}
                 onChange={(e) => setName(e.target.value)} style={{ marginBottom: 0 }} />
          <button className="plat-btn" disabled={saving || !ready || !name.trim()} onClick={save}>
            {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
          </button>
        </div>
      </div>

      <div className="rb-preview">
        {!ready ? (
          <div className="panel"><div className="note">{shapeHint(viz)}</div></div>
        ) : previewErr ? (
          <div className="panel"><div className="note" style={{ color: '#B4432B' }}>{previewErr}</div></div>
        ) : !result ? (
          <div className="admin-loading">{previewing ? 'Running…' : 'Preview'}</div>
        ) : (
          <ResultView result={result} accent={accent} />
        )}

        {saved.length > 0 && (
          <div className="panel" style={{ marginTop: 12 }}>
            <h3 style={{ marginBottom: 8 }}>Saved reports</h3>
            {saved.map((r) => (
              <div key={r.id} className="rb-saved-row">
                <button className="rb-saved-open" onClick={() => openSaved(r)}>{r.name}</button>
                <span className="note">{r.owner_name ?? '—'}</span>
                <button className="plat-btn ghost" onClick={() => remove(r)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
