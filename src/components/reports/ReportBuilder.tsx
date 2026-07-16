import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  api, GAUGE_TONES, type ComboAs, type ComboAxis, type ComboConfig,
  type GaugeConfig, type GaugeTone, type RegistrySource, type ReportDefinition,
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

// 'number' is labelled "Metric" because that is what it is: one big figure per
// measure, no dimension. The viz KEY stays 'number' so saved reports and the
// server allow-list are untouched — this is a label, not a new viz.
const VIZ_LABEL: Record<ReportViz, string> = {
  table: 'Table', bar: 'Bar', number: 'Metric', funnel: 'Funnel',
  stacked_bar: 'Stacked bar', grouped_bar: 'Grouped bar', line: 'Line',
  donut: 'Donut', pie: 'Pie', scatter: 'Scatter',
  scatter_records: 'Scatter (per record)',
  combo: 'Combination', gauge: 'Gauge',
}

// Short labels: the tone select shares a narrow row with a bound input and a
// Remove button, and a longer word crowds the dropdown arrow.
const TONE_LABEL: Record<GaugeTone, string> = {
  good: 'Good', warn: 'Warn', bad: 'Bad', neutral: 'Neutral', accent: 'Accent',
}

// A gauge needs a scale before it can render, and an empty one is not a sensible
// starting state. This seeds a valid three-band scale the user then edits; the
// server re-validates whatever comes back regardless.
function defaultGauge(): GaugeConfig {
  return { min: 0, max: 100, bands: [{ to: 50, tone: 'bad' }, { to: 80, tone: 'warn' }, { to: 100, tone: 'good' }] }
}

// Series (breakdown) modes — mirror the server: stacked/grouped require a
// second dimension, line may take one, everything else takes none.
type SeriesMode = 'required' | 'optional' | 'none'
function seriesMode(viz: ReportViz): SeriesMode {
  if (viz === 'stacked_bar' || viz === 'grouped_bar') return 'required'
  if (viz === 'line') return 'optional'
  return 'none'
}

// Which viz needs what shape — mirrors the server's validation so the preview
// only fires on a runnable definition (the server still enforces).
function isRunnable(viz: ReportViz, dims: string[], measures: string[], series: string): boolean {
  if (viz === 'funnel') return true
  if (viz === 'number') return dims.length === 0 && measures.length >= 1
  if (viz === 'bar') return dims.length === 1 && measures.length >= 1
  if (viz === 'donut' || viz === 'pie') return dims.length === 1 && measures.length === 1
  // scatter plots one point per group: x = first measure, y = second. Exactly
  // two, mirroring the server — a third has nowhere to go, one leaves an axis bare.
  if (viz === 'scatter') return dims.length === 1 && measures.length === 2
  // Per-record scatter plots one point per RECORD, so it groups by nothing: no
  // dimension, and two measures that have a per-record value (the server rejects
  // a total like Count, which only exists for a group).
  if (viz === 'scatter_records') return dims.length === 0 && measures.length === 2
  // A combo combines measures, so two is the minimum that means anything.
  if (viz === 'combo') return dims.length === 1 && measures.length >= 2
  // A gauge is one figure against a scale: same shape as a Metric.
  if (viz === 'gauge') return dims.length === 0 && measures.length === 1
  if (viz === 'stacked_bar' || viz === 'grouped_bar') {
    return dims.length === 1 && measures.length === 1 && !!series && !dims.includes(series)
  }
  if (viz === 'line') {
    if (dims.length !== 1 || measures.length < 1) return false
    return series ? (measures.length === 1 && !dims.includes(series)) : true
  }
  return dims.length >= 1 && measures.length >= 1   // table
}

function shapeHint(viz: ReportViz): string {
  if (viz === 'number') return 'Pick one or more measures (no dimensions).'
  if (viz === 'bar') return 'Pick exactly one dimension and at least one measure.'
  if (viz === 'donut' || viz === 'pie') return 'Pick exactly one dimension and exactly one measure.'
  if (viz === 'scatter') return 'Pick one dimension and exactly two measures. The first is the x axis, the second is the y axis, and each point is one group.'
  if (viz === 'scatter_records') return 'Pick exactly two measures and no dimension. Each point is one record. Totals like Count cannot be plotted per record.'
  if (viz === 'combo') return 'Pick exactly one dimension and at least two measures, then choose how each one draws.'
  if (viz === 'gauge') return 'Pick exactly one measure and no dimension, then set the scale below.'
  if (viz === 'stacked_bar' || viz === 'grouped_bar') return 'Pick one dimension, one breakdown, and one measure.'
  if (viz === 'line') return 'Pick one dimension and at least one measure. A breakdown takes one measure.'
  if (viz === 'table') return 'Pick at least one dimension and one measure.'
  return ''
}

export function ReportBuilder({ start, end, ownerId }: Props) {
  const toast = useToast()
  const [sources, setSources] = useState<RegistrySource[]>([])
  const [sourceKey, setSourceKey] = useState('')
  const [dims, setDims] = useState<string[]>([])
  const [measures, setMeasures] = useState<string[]>([])
  const [series, setSeries] = useState<string>('')                     // '' = no breakdown
  const [filters, setFilters] = useState<Record<string, string>>({})   // field -> value ('' = any)
  const [viz, setViz] = useState<ReportViz>('table')
  const [combo, setCombo] = useState<ComboConfig>({})
  const [gauge, setGauge] = useState<GaugeConfig>(defaultGauge)

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
    setDims([]); setMeasures([]); setSeries(''); setFilters({})
    setCombo({}); setGauge(defaultGauge())
    const s = sources.find((x) => x.key === key)
    setViz(s && s.viz.includes('table') ? 'table' : (s?.viz[0] ?? 'table'))
    setResult(null); setPreviewErr(''); setEditingId(null); setName('')
  }

  const usesSeries = seriesMode(viz) !== 'none'
  // A funnel groups by its own stages; a per-record scatter and a gauge group by
  // nothing. None of them take a dimension, so none of them offer one.
  const usesDims = viz !== 'funnel' && viz !== 'scatter_records' && viz !== 'gauge'

  const definition: ReportDefinition | null = useMemo(() => {
    if (!source) return null
    const clauses = Object.entries(filters)
      .filter(([, v]) => v !== '')
      .map(([field, value]) => ({ field, value }))
    return {
      source: source.key,
      dimensions: usesDims ? dims : [],
      measures: viz === 'funnel' ? [] : measures,
      series: usesSeries && series ? series : undefined,
      filters: clauses,
      date: (start || end) ? { start: start || undefined, end: end || undefined } : undefined,
      owner_id: source.has_owner && ownerId ? ownerId : undefined,
      viz,
      // A viz-specific config only travels with its own viz — the server 400s it
      // anywhere else, so sending it would break every other preview.
      combo: viz === 'combo' ? combo : undefined,
      gauge: viz === 'gauge' ? gauge : undefined,
    }
  }, [source, dims, measures, series, usesSeries, usesDims, filters, viz, start, end,
      ownerId, combo, gauge])

  const ready = !!source && isRunnable(viz, usesDims ? dims : [], viz === 'funnel' ? [] : measures, series)

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

  function toggle(setList: Dispatch<SetStateAction<string[]>>, key: string) {
    setList((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]))
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
    setSeries(d.series ?? '')
    setFilters(Object.fromEntries((d.filters ?? []).map((f) => [f.field, f.value])))
    setViz(d.viz)
    // Restore the viz config exactly as saved, so reopening a report reproduces
    // the chart rather than resetting it to defaults.
    setCombo(d.combo ?? {})
    setGauge(d.gauge ?? defaultGauge())
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
            {usesDims ? (
              <>
                <label className="rb-lbl">Dimensions (group by)</label>
                <div className="rb-chips">
                  {source.dimensions.map((d) => (
                    <button key={d.key} className={`rb-chip${dims.includes(d.key) ? ' on' : ''}`}
                            onClick={() => toggle(setDims, d.key)}>{d.label}</button>
                  ))}
                </div>
              </>
            ) : viz === 'gauge' ? (
              <div className="note" style={{ marginTop: 10 }}>
                A gauge shows one figure against a scale, so there is nothing to group by.
              </div>
            ) : (
              <div className="note" style={{ marginTop: 10 }}>
                Each point is one record, so there is nothing to group by. Pick the two
                measures to plot.
              </div>
            )}
            <label className="rb-lbl">Measures</label>
            <div className="rb-chips">
              {source.measures.map((m) => (
                <button key={m.key} className={`rb-chip${measures.includes(m.key) ? ' on' : ''}`}
                        onClick={() => toggle(setMeasures, m.key)}>{m.label}</button>
              ))}
            </div>

            {viz === 'combo' && measures.length > 0 && (
              <>
                <label className="rb-lbl">How each measure draws</label>
                {measures.map((mk) => {
                  const m = source.measures.find((x) => x.key === mk)
                  const spec = combo[mk] ?? { as: 'bar' as ComboAs, axis: 'left' as ComboAxis }
                  const set = (patch: Partial<{ as: ComboAs; axis: ComboAxis }>) =>
                    setCombo((cur) => ({ ...cur, [mk]: { ...spec, ...patch } }))
                  return (
                    <div key={mk} className="rb-combo-row">
                      <span className="rb-combo-name">{m?.label ?? mk}</span>
                      <select className="plat-input" style={{ marginBottom: 0 }} value={spec.as}
                              aria-label={`${m?.label ?? mk} draw type`}
                              onChange={(e) => set({ as: e.target.value as ComboAs })}>
                        <option value="bar">Bar</option>
                        <option value="line">Line</option>
                      </select>
                      <select className="plat-input" style={{ marginBottom: 0 }} value={spec.axis}
                              aria-label={`${m?.label ?? mk} axis`}
                              onChange={(e) => set({ axis: e.target.value as ComboAxis })}>
                        <option value="left">Left axis</option>
                        <option value="right">Right axis</option>
                      </select>
                    </div>
                  )
                })}
                <div className="note" style={{ marginTop: 6 }}>
                  Put measures with different units on opposite axes, for example a count
                  as bars on the left and a money total as a line on the right.
                </div>
              </>
            )}

            {viz === 'gauge' && (
              <>
                <label className="rb-lbl">Scale</label>
                <div className="rb-gauge-mm">
                  <input className="plat-input" type="number" style={{ marginBottom: 0 }}
                         aria-label="Gauge minimum" value={gauge.min}
                         onChange={(e) => setGauge((g) => ({ ...g, min: Number(e.target.value) }))} />
                  <span className="note">to</span>
                  <input className="plat-input" type="number" style={{ marginBottom: 0 }}
                         aria-label="Gauge maximum" value={gauge.max}
                         onChange={(e) => setGauge((g) => ({ ...g, max: Number(e.target.value) }))} />
                </div>
                <label className="rb-lbl">Bands</label>
                {gauge.bands.map((b, i) => (
                  <div key={i} className="rb-band-row">
                    <span className="rb-band-lbl">up to</span>
                    <input className="plat-input rb-band-to" type="number"
                           aria-label={`Band ${i + 1} upper bound`} value={b.to}
                           onChange={(e) => setGauge((g) => ({
                             ...g,
                             bands: g.bands.map((x, j) => (j === i ? { ...x, to: Number(e.target.value) } : x)),
                           }))} />
                    <select className="plat-input rb-band-tone" value={b.tone}
                            aria-label={`Band ${i + 1} tone`}
                            onChange={(e) => setGauge((g) => ({
                              ...g,
                              bands: g.bands.map((x, j) => (j === i ? { ...x, tone: e.target.value as GaugeTone } : x)),
                            }))}>
                      {GAUGE_TONES.map((t) => <option key={t} value={t}>{TONE_LABEL[t]}</option>)}
                    </select>
                    <button className="plat-btn ghost" aria-label={`Remove band ${i + 1}`}
                            disabled={gauge.bands.length <= 1}
                            onClick={() => setGauge((g) => ({
                              ...g, bands: g.bands.filter((_, j) => j !== i),
                            }))}>Remove</button>
                  </div>
                ))}
                <button className="plat-btn ghost" style={{ marginTop: 6 }}
                        onClick={() => setGauge((g) => {
                          const last = g.bands[g.bands.length - 1]
                          const to = last ? Math.max(last.to + 1, g.max) : g.max
                          return { ...g, bands: [...g.bands, { to, tone: 'neutral' }] }
                        })}>Add band</button>
                <div className="note" style={{ marginTop: 6 }}>
                  Bands must rise in order and the last one must end at the maximum, so the
                  whole scale is covered. The server checks this and says what is wrong.
                </div>
              </>
            )}

            {usesSeries && (
              <>
                <label className="rb-lbl">
                  Breakdown (series){seriesMode(viz) === 'optional' ? ' (optional)' : ''}
                </label>
                <select className="plat-input" value={series} onChange={(e) => setSeries(e.target.value)}>
                  <option value="">{seriesMode(viz) === 'required' ? 'Choose a breakdown…' : 'No breakdown'}</option>
                  {source.dimensions.filter((d) => !dims.includes(d.key)).map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
              </>
            )}
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
          // `definition` is what produced this preview, so a drill re-runs the
          // same population and the popup's count matches the datapoint.
          <ResultView result={result} accent={accent} definition={definition ?? undefined} />
        )}

        {saved.length > 0 && (
          <div className="panel" style={{ marginTop: 12 }}>
            <h3 style={{ marginBottom: 8 }}>Saved reports</h3>
            {saved.map((r) => (
              <div key={r.id} className="rb-saved-row">
                <button className="rb-saved-open" onClick={() => openSaved(r)}>{r.name}</button>
                <span className="note">{r.owner_name ?? '-'}</span>
                <button className="plat-btn ghost" onClick={() => remove(r)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
