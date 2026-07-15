import { useEffect, useRef, useState } from 'react'
import { api, type OwnerOption, type SearchResult, type SegmentCriteria, type SegmentProp, type SegmentSource } from '../lib/api'

// OR-of-AND-groups criteria builder for Segments. Mirrors the WS2b report
// builder's chip/panel styling. Every field/operator offered comes from the
// server registry (source.props); the server re-validates on save, so nothing
// here can widen what the engine accepts.

const NO_VALUE_OPS = new Set(['is_known', 'is_unknown'])

interface Props {
  source: SegmentSource
  criteria: SegmentCriteria
  onChange: (c: SegmentCriteria) => void
  owners: OwnerOption[]
  accent: string
}

function defaultOperator(prop: SegmentProp): string {
  return prop.operators[0]?.key ?? 'is'
}

export function SegmentCriteriaBuilder({ source, criteria, onChange, owners, accent }: Props) {
  const groups = criteria.groups ?? []

  function setGroups(next: SegmentCriteria['groups']) {
    onChange({ groups: next })
  }

  function addGroup() {
    const first = source.props[0]
    setGroups([...groups, { conditions: [{ field: first.key, operator: defaultOperator(first), value: '' }] }])
  }
  function cloneGroup(gi: number) {
    const copy = JSON.parse(JSON.stringify(groups[gi]))
    setGroups([...groups.slice(0, gi + 1), copy, ...groups.slice(gi + 1)])
  }
  function deleteGroup(gi: number) {
    setGroups(groups.filter((_, i) => i !== gi))
  }
  function addCondition(gi: number) {
    const first = source.props[0]
    const next = groups.map((g, i) => i === gi
      ? { conditions: [...g.conditions, { field: first.key, operator: defaultOperator(first), value: '' }] }
      : g)
    setGroups(next)
  }
  function removeCondition(gi: number, ci: number) {
    const next = groups.map((g, i) => i === gi
      ? { conditions: g.conditions.filter((_, j) => j !== ci) }
      : g).filter((g) => g.conditions.length > 0)
    setGroups(next)
  }
  function patchCondition(gi: number, ci: number, patch: Partial<{ field: string; operator: string; value: string }>) {
    const next = groups.map((g, i) => i === gi
      ? {
          conditions: g.conditions.map((c, j) => {
            if (j !== ci) return c
            const merged = { ...c, ...patch }
            // field change → reset operator + value to that field's default
            if (patch.field !== undefined && patch.field !== c.field) {
              const p = source.props.find((x) => x.key === patch.field)
              merged.operator = p ? defaultOperator(p) : 'is'
              merged.value = ''
            }
            if (patch.operator !== undefined && NO_VALUE_OPS.has(patch.operator)) {
              merged.value = ''
            }
            return merged
          }),
        }
      : g)
    setGroups(next)
  }

  return (
    <div className="seg-criteria">
      {groups.length === 0 && (
        <div className="note" style={{ marginBottom: 8 }}>
          No filters yet. This list matches <b>every {source.object_type}</b>. Add a filter group to narrow it.
        </div>
      )}
      {groups.map((g, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="seg-or">OR</div>}
          <div className="seg-group" style={{ borderLeftColor: accent }}>
            <div className="seg-group-head">
              <span className="note">Match <b>all</b> of:</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button type="button" className="plat-btn ghost" onClick={() => cloneGroup(gi)}>Clone</button>
                <button type="button" className="plat-btn ghost" onClick={() => deleteGroup(gi)}>Delete group</button>
              </div>
            </div>
            {g.conditions.map((c, ci) => {
              const prop = source.props.find((p) => p.key === c.field) ?? source.props[0]
              return (
                <div key={ci} className="seg-cond">
                  <select className="plat-input" style={{ marginBottom: 0, minWidth: 150 }}
                          value={c.field} onChange={(e) => patchCondition(gi, ci, { field: e.target.value })}>
                    {source.props.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                  <select className="plat-input" style={{ marginBottom: 0, minWidth: 130 }}
                          value={c.operator} onChange={(e) => patchCondition(gi, ci, { operator: e.target.value })}>
                    {prop.operators.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  {!NO_VALUE_OPS.has(c.operator) && (
                    <ConditionValue prop={prop} value={c.value ?? ''} owners={owners}
                                    onChange={(v) => patchCondition(gi, ci, { value: v })} />
                  )}
                  <button type="button" className="linklike" style={{ color: '#B4432B' }}
                          onClick={() => removeCondition(gi, ci)}>✕</button>
                </div>
              )
            })}
            <button type="button" className="plat-btn ghost" style={{ marginTop: 6 }} onClick={() => addCondition(gi)}>
              + Add condition
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="plat-btn ghost" style={{ marginTop: 8 }} onClick={addGroup}>
        + Add {groups.length > 0 ? 'OR ' : ''}filter group
      </button>
    </div>
  )
}

interface ValueProps {
  prop: SegmentProp
  value: string
  owners: OwnerOption[]
  onChange: (v: string) => void
}

function ConditionValue({ prop, value, owners, onChange }: ValueProps) {
  if (prop.type === 'enum') {
    return (
      <select className="plat-input" style={{ marginBottom: 0, minWidth: 140 }} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {(prop.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (prop.type === 'date') {
    return <input type="date" className="plat-input" style={{ marginBottom: 0 }} value={value} onChange={(e) => onChange(e.target.value)} />
  }
  if (prop.type === 'uuid_ref' && prop.ref === 'owner') {
    return (
      <select className="plat-input" style={{ marginBottom: 0, minWidth: 160 }} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select owner…</option>
        {owners.map((o) => <option key={o.id} value={o.id}>{o.is_active ? o.name : `${o.name} (inactive)`}</option>)}
      </select>
    )
  }
  if (prop.type === 'uuid_ref' && prop.ref === 'company') {
    return <CompanyPicker value={value} onChange={onChange} />
  }
  return <input className="plat-input" style={{ marginBottom: 0, minWidth: 150 }} placeholder="value" value={value} onChange={(e) => onChange(e.target.value)} />
}

function CompanyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState('')
  const [label, setLabel] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) { setResults([]); return }
    timer.current = setTimeout(() => {
      api.globalSearch(q.trim())
        .then((r) => setResults(r.results.filter((x) => x.type === 'company').slice(0, 6)))
        .catch(() => setResults([]))
    }, 250)
  }, [q])

  if (value && label) {
    return (
      <span className="seg-picked">
        {label}
        <button type="button" className="linklike" onClick={() => { onChange(''); setLabel(''); setQ('') }} style={{ marginLeft: 6 }}>✕</button>
      </span>
    )
  }
  return (
    <div className="seg-company-picker">
      <input className="plat-input" style={{ marginBottom: 0, minWidth: 170 }} placeholder="Search company…"
             value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} />
      {open && results.length > 0 && (
        <div className="seg-company-results">
          {results.map((r) => (
            <button type="button" key={r.id} className="seg-company-opt"
                    onClick={() => { onChange(r.id); setLabel(r.title); setOpen(false) }}>
              {r.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
