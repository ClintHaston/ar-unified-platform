import { useCallback, useEffect, useState } from 'react'
import { api, type ListingField, type ListingFieldsResponse, type SearchResult } from '../lib/api'

// 4d: the TAB listing-fields capture path, inline on deal detail. A rep
// links the unit the deal is selling → derives category/condition/make/
// model/year/location (+industry/type/description/photos) through the
// reviewable 76→6 map, filling nothing that already exists → fills any
// remaining gaps by hand → sets resubmit_to_tab. The SAME 14-field
// validation the publish gate uses is shown inline, so the rep sees
// exactly what's missing before requesting publish.

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  derived_unit: { label: 'from unit', cls: 'green' },
  spec: { label: 'from spec', cls: 'grey' },
  deal: { label: 'from deal', cls: 'grey' },
  manual: { label: 'manual', cls: 'gold' },
  none: { label: 'needs entry', cls: 'red' },
}

interface Props {
  dealId: string
}

export function TabListingPanel({ dealId }: Props) {
  const [data, setData] = useState<ListingFieldsResponse | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [unitQuery, setUnitQuery] = useState('')
  const [unitResults, setUnitResults] = useState<SearchResult[]>([])

  const load = useCallback(() => {
    api.listingFields(dealId)
      .then((res) => { setData(res); setEdits({}); setError('') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
  }, [dealId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (unitQuery.trim().length < 2) { setUnitResults([]); return }
    let live = true
    const t = setTimeout(() => {
      api.globalSearch(unitQuery.trim())
        .then((r) => { if (live) setUnitResults(r.results.filter((x) => x.type === 'unit').slice(0, 6)) })
        .catch(() => { if (live) setUnitResults([]) })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [unitQuery])

  async function run(label: string, fn: () => Promise<ListingFieldsResponse>) {
    setBusy(label); setError('')
    try {
      const res = await fn()
      setData(res); setEdits({})
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy('')
    }
  }

  async function saveEdits() {
    const changed = Object.fromEntries(
      Object.entries(edits).filter(([k, v]) => {
        const field = data?.fields.find((f) => f.key === k)
        return v !== (field?.value ?? '')
      }),
    )
    if (Object.keys(changed).length === 0) return
    await run('save', () => api.patchListingFields(dealId, changed))
  }

  async function togglePublish() {
    if (!data) return
    await run('publish', () =>
      (data.resubmit_to_tab ? api.cancelTabPublish(dealId) : api.requestTabPublish(dealId))
        .then(() => api.listingFields(dealId)),
    )
  }

  if (!data) return (
    <div className="panel"><h3>TAB listing</h3>
      <div className="note">{error || 'Loading…'}</div></div>
  )

  const fieldVal = (f: ListingField) => (f.key in edits ? edits[f.key] : (f.value ?? ''))

  return (
    <div className="panel">
      <h3>TAB listing</h3>
      {data.tab_published_at ? (
        <div className="note" style={{ marginBottom: 10 }}>
          <span className="pill green">published</span> TAB listing{' '}
          <b>{data.tab_listing_id}</b> · {new Date(data.tab_published_at).toLocaleDateString()}
        </div>
      ) : !data.at_publish_stage ? (
        <div className="note" style={{ marginBottom: 10 }}>
          This deal isn't at the "Requested" (publish) stage — capture fields now; publishing
          happens once it reaches Requested.
        </div>
      ) : null}

      {/* Unit link + derivation */}
      <div className="fieldrow" style={{ alignItems: 'center' }}>
        <span>Unit</span>
        <span>
          {data.unit ? (
            <>
              <b>{data.unit.title}</b>
              <button className="plat-btn ghost" style={{ marginLeft: 8 }}
                      disabled={!!busy} onClick={() => run('unlink', () => api.unlinkDealUnit(dealId))}>
                unlink
              </button>
            </>
          ) : <i className="note">none linked</i>}
        </span>
      </div>
      {!data.unit && (
        <div style={{ margin: '6px 0 10px' }}>
          <input className="plat-input" placeholder="Search the unit this deal sells…"
                 value={unitQuery} onChange={(e) => setUnitQuery(e.target.value)} />
          {unitResults.map((u) => (
            <button key={u.id} className="plat-btn ghost" style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 4 }}
                    disabled={!!busy}
                    onClick={() => { setUnitQuery(''); setUnitResults([]); run('link', () => api.linkDealUnit(dealId, u.id)) }}>
              {u.title}{u.subtitle ? ` · ${u.subtitle}` : ''}
            </button>
          ))}
        </div>
      )}
      {data.unit && (
        <button className="plat-btn" style={{ marginBottom: 10 }} disabled={!!busy}
                onClick={() => run('derive', () => api.deriveListingFields(dealId))}>
          {busy === 'derive' ? 'Deriving…' : 'Derive from unit'}
        </button>
      )}
      {data.derive_result && (
        <div className="note" style={{ marginBottom: 8 }}>
          Derived {data.derive_result.derived.length} field(s) from the unit.
          {data.derive_result.still_missing.length > 0
            ? ` Still needs: ${data.derive_result.still_missing.join(', ')}.`
            : ' All fields complete.'}
        </div>
      )}

      {/* The 14-field form */}
      <table className="plat-table" style={{ marginTop: 4 }}>
        <tbody>
          {data.fields.map((f) => {
            const badge = SOURCE_BADGE[f.source] ?? SOURCE_BADGE.none
            return (
              <tr key={f.key}>
                <td style={{ width: 150 }}>
                  {f.label}
                  <div><span className={`pill ${badge.cls}`}>{badge.label}</span></div>
                </td>
                <td>
                  <input className="plat-input" style={{ marginBottom: 0 }}
                         value={fieldVal(f)}
                         placeholder={f.derivable_from_unit ? 'derive from unit or enter' : 'enter'}
                         onChange={(e) => setEdits((s) => ({ ...s, [f.key]: e.target.value }))} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button className="plat-btn" disabled={!!busy || Object.keys(edits).length === 0}
                onClick={saveEdits}>
          {busy === 'save' ? 'Saving…' : 'Save fields'}
        </button>
        <div style={{ flex: 1 }} />
        {data.resubmit_to_tab ? (
          <>
            <span className="pill gold">queued for publish</span>
            <button className="plat-btn ghost" disabled={!!busy} onClick={togglePublish}>
              {busy === 'publish' ? '…' : 'Cancel'}
            </button>
          </>
        ) : (
          <button className="plat-btn" disabled={!!busy || !data.publishable}
                  title={data.publishable ? '' : 'Complete all fields first'}
                  onClick={togglePublish}>
            {busy === 'publish' ? '…' : 'Request TAB publish'}
          </button>
        )}
      </div>

      {!data.publishable && (
        <div className="note" style={{ color: '#B4432B', marginTop: 8 }}>
          Missing before publish: {data.missing.join(', ')}
        </div>
      )}
      {data.resubmit_to_tab && !data.tab_publish_armed && (
        <div className="note" style={{ marginTop: 6 }}>
          Queued — publishing is disarmed until cutover, so nothing goes to TAB yet.
        </div>
      )}
      {data.tab_publish_error && (
        <div className="note" style={{ color: '#B4432B', marginTop: 6 }}>
          Last publish attempt: {data.tab_publish_error}
        </div>
      )}
      {error && <div className="note" style={{ color: '#B4432B', marginTop: 6 }}>{error}</div>}
    </div>
  )
}
