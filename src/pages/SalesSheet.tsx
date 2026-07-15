import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type UnitCard } from '../lib/api'

// Sales sheet (prototype_4's last dead nav item, build step 3c-7): pick a
// unit, the server renders the brand-styled print-ready sheet — published
// Spec Builder description when the listing has one, live spec render via
// the shared pipeline otherwise. Customer-facing: asking price only.

const SOURCE_NOTE: Record<string, string> = {
  published: 'Spec section is the published Spec Builder description for this listing.',
  generated: 'Spec section rendered live from the OEM baseline (no published listing description).',
  none: 'No spec template or taxonomy links for this unit. Showing unit facts only.',
}

export function SalesSheet() {
  const [units, setUnits] = useState<UnitCard[]>([])
  const [filter, setFilter] = useState('')
  const [unitId, setUnitId] = useState('')
  const [html, setHtml] = useState('')
  const [source, setSource] = useState('')
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState('')
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    api.units()
      .then((res) => setUnits(res.units.filter((u) => !u.archived)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load units'))
      .finally(() => setLoadingUnits(false))
  }, [])

  const shortlist = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const pool = needle
      ? units.filter((u) => [u.title, u.serial, u.make_name, u.model_name]
          .filter(Boolean).join(' ').toLowerCase().includes(needle))
      : units
    return pool.slice(0, 30)
  }, [units, filter])

  useEffect(() => {
    if (!unitId) { setHtml(''); setSource(''); return }
    setRendering(true)
    setError('')
    api.salesSheet(unitId)
      .then((res) => { setHtml(res.html); setSource(res.spec_source) })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to render sheet'))
      .finally(() => setRendering(false))
  }, [unitId])

  function printSheet() {
    frameRef.current?.contentWindow?.print()
  }

  return (
    <div>
      <div className="panel" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="plat-input"
            style={{ marginBottom: 0, maxWidth: 240 }}
            placeholder="Filter units…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="plat-input"
            style={{ marginBottom: 0, maxWidth: 380 }}
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            disabled={loadingUnits}
          >
            <option value="">{loadingUnits ? 'Loading units…' : 'Choose a unit…'}</option>
            {shortlist.map((u) => (
              <option key={u.id} value={u.id}>
                {u.title}{u.serial ? ` · ${u.serial}` : ''}
              </option>
            ))}
          </select>
          {html && (
            <button className="plat-btn" style={{ marginLeft: 'auto' }} onClick={printSheet}>
              Print / Save PDF
            </button>
          )}
        </div>
        {filter && shortlist.length === 30 && (
          <div className="note">Showing the first 30 matches. Refine the filter.</div>
        )}
      </div>

      {rendering && <div className="admin-loading">Rendering sheet… (first render for a unit may take a few seconds)</div>}
      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}

      {html && !rendering && (
        <>
          <iframe
            ref={frameRef}
            title="Sales sheet"
            srcDoc={html}
            style={{ width: '100%', height: 720, border: '1px solid var(--p-steel)', borderRadius: 9, background: '#fff' }}
          />
          <div className="note">{SOURCE_NOTE[source] ?? ''}</div>
        </>
      )}
      {!html && !rendering && !loadingUnits && (
        <div className="note">
          Server-rendered, brand-styled, ready to send or print. Asking price only. Internal
          valuations never appear on a sheet.
        </div>
      )}
    </div>
  )
}
