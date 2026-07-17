import { useCallback, useEffect, useState } from 'react'
import { api, type ListingField, type ListingFieldsResponse, type ListingOptions,
         type OptionPair, type SearchResult, type TaxOption } from '../lib/api'

// 4d: the TAB listing-fields capture path, inline on deal detail. A rep
// links the unit the deal is selling → derives category/condition/make/
// model/year/location (+industry/type/description/photos) through the
// reviewable 76→6 map, filling nothing that already exists → fills any
// remaining gaps by hand → sets resubmit_to_tab. The SAME validation the
// publish gate uses is shown inline, so the rep sees exactly what's
// missing before requesting publish.
//
// Dependent dropdowns (Sales Command parity): Category filters Subcategory,
// Industry filters Equipment type, Make filters the Model suggestions, all
// live per selection with downstream resets. Option lists come from
// /platform/listing-options (TAB taxonomy cascades + the closed publish
// sets). Derived values PRE-SELECT their dropdown; an unrecognized stored
// value stays visible as its own option and the membership validation
// flags it. If the options fetch fails the form falls back to free text.

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  derived_unit: { label: 'from unit', cls: 'green' },
  spec: { label: 'from spec', cls: 'grey' },
  deal: { label: 'from deal', cls: 'grey' },
  manual: { label: 'manual', cls: 'gold' },
  none: { label: 'needs entry', cls: 'red' },
}

const PHOTOS_READY_OPTIONS: OptionPair[] = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
]

const norm = (s: string) => s.trim().toLowerCase()

function findPair(v: string, pairs: OptionPair[]): OptionPair | undefined {
  const n = norm(v)
  return pairs.find((p) => norm(p.value) === n || norm(p.label) === n)
}

function findTax(v: string, opts: TaxOption[]): TaxOption | undefined {
  const n = norm(v)
  return opts.find((o) => norm(o.id) === n || norm(o.name) === n)
}

interface Props {
  dealId: string
}

export function TabListingPanel({ dealId }: Props) {
  const [data, setData] = useState<ListingFieldsResponse | null>(null)
  const [options, setOptions] = useState<ListingOptions | null>(null)
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
    api.listingOptions()
      .then(setOptions)
      .catch(() => setOptions(null))  // free-text fallback, form still works
  }, [])

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
  const raw = (key: string): string => {
    const f = data.fields.find((x) => x.key === key)
    return f ? String(fieldVal(f)) : ''
  }
  const setField = (key: string, v: string) => setEdits((s) => ({ ...s, [key]: v }))

  // ── cascade option lists + handlers (Sales Command pattern: the dependent
  // list filters live on the parent selection; changing the parent clears an
  // incompatible child) ────────────────────────────────────────────────────

  const subsForCat = (catValue: string): string[] => {
    if (!options) return []
    const p = findPair(catValue, options.categories)
    // TAB carries no subcategory list for some categories (transportation,
    // agriculture): fall back to the full list, same as Sales Command
    return (p && options.category_to_subcategories[p.value]) || options.subcategories_all
  }

  const typesForInd = (ind: TaxOption | undefined): TaxOption[] => {
    if (!options) return []
    if (!ind) return options.equipment_types
    const slugs = options.industry_to_equipment_types[ind.id]
    return slugs?.length
      ? options.equipment_types.filter((t) => slugs.includes(t.id))
      : options.equipment_types
  }

  function onCategoryChange(v: string) {
    const validSubs = v ? subsForCat(v) : []
    const curSub = raw('subcategory')
    const keep = !!curSub && validSubs.some((s) => norm(s) === norm(curSub))
    setEdits((s) => ({ ...s, category: v, ...(keep ? {} : { subcategory: '' }) }))
  }

  function onIndustryChange(v: string) {
    const ind = options?.industries.find((i) => i.id === v)
    const valid = v ? typesForInd(ind) : []
    const curType = raw('equipment_type')
    const keep = !!curType
      && valid.some((t) => norm(t.id) === norm(curType) || norm(t.name) === norm(curType))
    setEdits((s) => ({ ...s, equipment_industry: v, ...(keep ? {} : { equipment_type: '' }) }))
  }

  function onMakeChange(v: string) {
    // model suggestions change with the make, so an existing model is cleared
    setEdits((s) => ({ ...s, equipment_make: v, equipment_model: '' }))
  }

  // ── field renderers ──────────────────────────────────────────────────────

  function textInput(f: ListingField) {
    return (
      <input className="plat-input" style={{ marginBottom: 0 }}
             value={fieldVal(f)}
             placeholder={f.derivable_from_unit ? 'derive from unit or enter' : 'enter'}
             onChange={(e) => setField(f.key, e.target.value)} />
    )
  }

  function pairSelect(f: ListingField, pairs: OptionPair[],
                      onChange?: (v: string) => void,
                      cfg?: { disabled?: boolean; hint?: string }) {
    const rawV = String(fieldVal(f))
    const m = rawV ? findPair(rawV, pairs) : undefined
    return (
      <select className="plat-input" style={{ marginBottom: 0 }}
              value={m ? m.value : rawV}
              disabled={cfg?.disabled}
              onChange={(e) => (onChange ?? ((v: string) => setField(f.key, v)))(e.target.value)}>
        <option value="">{cfg?.disabled && cfg.hint ? cfg.hint : '-'}</option>
        {rawV && !m && <option value={rawV}>{rawV} (not recognized)</option>}
        {pairs.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
    )
  }

  function stringSelect(f: ListingField, values: string[],
                        onChange?: (v: string) => void,
                        cfg?: { disabled?: boolean; hint?: string }) {
    return pairSelect(f, values.map((v) => ({ value: v, label: v })), onChange, cfg)
  }

  function taxSelect(f: ListingField, opts: TaxOption[],
                     onChange?: (v: string) => void,
                     cfg?: { disabled?: boolean; hint?: string }) {
    const rawV = String(fieldVal(f))
    const m = rawV ? findTax(rawV, opts) : undefined
    return (
      <select className="plat-input" style={{ marginBottom: 0 }}
              value={m ? m.id : rawV}
              disabled={cfg?.disabled}
              onChange={(e) => (onChange ?? ((v: string) => setField(f.key, v)))(e.target.value)}>
        <option value="">{cfg?.disabled && cfg.hint ? cfg.hint : '-'}</option>
        {rawV && !m && <option value={rawV}>{rawV} (not recognized)</option>}
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    )
  }

  function modelInput(f: ListingField) {
    if (!options) return textInput(f)
    const makeRaw = raw('equipment_make')
    const makeName = makeRaw
      ? (options.makes.find((m) => norm(m) === norm(makeRaw)) ?? makeRaw)
      : ''
    const suggestions = makeName
      ? (options.make_to_models[makeName] ?? options.models_all)
      : options.models_all
    const listId = `tab-models-${dealId}`
    return (
      <>
        <input className="plat-input" style={{ marginBottom: 0 }} list={listId}
               value={fieldVal(f)} disabled={!makeRaw}
               placeholder={makeRaw ? 'Select or type model' : 'Select make first'}
               onChange={(e) => setField(f.key, e.target.value)} />
        <datalist id={listId}>
          {suggestions.map((m) => <option key={m} value={m} />)}
        </datalist>
      </>
    )
  }

  function renderInput(f: ListingField) {
    if (!options) return textInput(f)
    switch (f.key) {
      case 'category':
        return pairSelect(f, options.categories, onCategoryChange)
      case 'subcategory': {
        const cat = raw('category')
        return stringSelect(f, cat ? subsForCat(cat) : [], undefined,
                            { disabled: !cat, hint: 'Select category first' })
      }
      case 'equipment_industry':
        return taxSelect(f, options.industries, onIndustryChange)
      case 'equipment_type': {
        const indRaw = raw('equipment_industry')
        const ind = indRaw ? findTax(indRaw, options.industries) : undefined
        return taxSelect(f, typesForInd(ind), undefined,
                         { disabled: !indRaw, hint: 'Select industry first' })
      }
      case 'equipment_make':
        return stringSelect(f, options.makes, onMakeChange)
      case 'equipment_model':
        return modelInput(f)
      case 'equipment_year':
        return stringSelect(f, options.years)
      case 'condition':
        return pairSelect(f, options.conditions)
      case 'listing_type':
        return pairSelect(f, options.listing_types)
      case 'inspection_contact':
        return pairSelect(f, options.inspection_contacts)
      case 'photos_ready':
        return pairSelect(f, PHOTOS_READY_OPTIONS)
      default:
        return textInput(f)
    }
  }

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
          This deal isn't at the "Requested" (publish) stage. Capture fields now; publishing
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
      {!options && (
        <div className="note" style={{ marginBottom: 8 }}>
          Option lists unavailable, fields accept typed values.
        </div>
      )}

      {/* The listing-fields form (14 required + optional listing type) */}
      <table className="plat-table" style={{ marginTop: 4 }}>
        <tbody>
          {data.fields.map((f) => {
            const badge = f.key === 'listing_type' && f.source === 'none'
              ? { label: 'optional', cls: 'grey' }
              : SOURCE_BADGE[f.source] ?? SOURCE_BADGE.none
            return (
              <tr key={f.key}>
                <td style={{ width: 150 }}>
                  {f.label}
                  <div><span className={`pill ${badge.cls}`}>{badge.label}</span></div>
                </td>
                <td>{renderInput(f)}</td>
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
          Queued. Publishing is disarmed until cutover, so nothing goes to TAB yet.
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
