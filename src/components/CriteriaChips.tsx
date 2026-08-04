import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type ContactCriteriaKind, type ContactCriteriaOption } from '../lib/api'

// Chip multi-select for the structured buyer-need criteria, with type-ahead
// WITHIN the options — it never accepts free text, because the value stored on
// the contact has to be an option slug the server will recognise. An admin who
// needs a new one adds it in Settings; that is a deliberate, one-place edit,
// not something a typo on a contact form should be able to create.
//
// The option lists are fetched, not bundled: they are admin-editable at
// runtime, so a hardcoded copy here would be exactly the deploy the spec ruled
// out. useCriteriaOptions caches per kind for the life of the page — a form
// with two of these should not make the same request twice.

const cache = new Map<ContactCriteriaKind, Promise<ContactCriteriaOption[]>>()

export function useCriteriaOptions(kind: ContactCriteriaKind): ContactCriteriaOption[] {
  const [options, setOptions] = useState<ContactCriteriaOption[]>([])
  useEffect(() => {
    let live = true
    if (!cache.has(kind)) {
      cache.set(kind, api.contactCriteriaOptions(kind)
        .then((r) => r.options)
        .catch(() => {
          // Do not poison the cache: a failed load should retry on the next
          // mount rather than leave every form permanently empty.
          cache.delete(kind)
          return []
        }))
    }
    void cache.get(kind)!.then((o) => { if (live) setOptions(o) })
    return () => { live = false }
  }, [kind])
  return options
}

/** Labels for stored slugs. An unknown slug (an option archived after this
 *  contact was saved) renders as its raw value rather than vanishing — the
 *  data is still there and hiding it would look like data loss. */
export function labelFor(options: ContactCriteriaOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value
}

interface Props {
  kind: ContactCriteriaKind
  label: string
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}

export function CriteriaChips({ kind, label, value, onChange, placeholder }: Props) {
  const options = useCriteriaOptions(kind)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const available = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return options
      .filter((o) => !value.includes(o.value))
      .filter((o) => !needle || o.label.toLowerCase().includes(needle))
  }, [options, value, q])

  function add(v: string) {
    if (!value.includes(v)) onChange([...value, v])
    setQ('')
  }

  return (
    <div className="cchips" ref={wrap}>
      <label className="cchips-label">{label}</label>
      <div className="cchips-box" onClick={() => setOpen(true)}>
        {value.map((v) => (
          <span key={v} className="cchip">
            {labelFor(options, v)}
            <button type="button" aria-label={`Remove ${labelFor(options, v)}`}
                    onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== v)) }}>
              ✕
            </button>
          </span>
        ))}
        <input className="cchips-input" value={q} placeholder={value.length ? '' : (placeholder ?? 'Type to search…')}
               onChange={(e) => { setQ(e.target.value); setOpen(true) }}
               onFocus={() => setOpen(true)}
               onKeyDown={(e) => {
                 // Enter takes the single remaining match — the fast path once
                 // you have typed enough to be unambiguous.
                 if (e.key === 'Enter' && available.length > 0) {
                   e.preventDefault(); add(available[0].value)
                 } else if (e.key === 'Backspace' && !q && value.length) {
                   onChange(value.slice(0, -1))
                 } else if (e.key === 'Escape') {
                   setOpen(false)
                 }
               }} />
      </div>
      {open && (
        <div className="cchips-menu">
          {available.length === 0 ? (
            <div className="note cchips-empty">
              {options.length === 0
                ? 'No options yet — an admin can add them in Settings.'
                : q.trim()
                  ? 'No match. An admin can add options in Settings.'
                  : 'All options selected.'}
            </div>
          ) : available.slice(0, 40).map((o) => (
            <button type="button" key={o.value} className="cchips-opt"
                    onClick={() => add(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Read-only chip row for the contact card. */
export function CriteriaChipList({ kind, value }: { kind: ContactCriteriaKind; value: string[] }) {
  const options = useCriteriaOptions(kind)
  if (!value.length) return <span>—</span>
  return (
    <span className="cchip-list">
      {value.map((v) => <span key={v} className="cchip static">{labelFor(options, v)}</span>)}
    </span>
  )
}
