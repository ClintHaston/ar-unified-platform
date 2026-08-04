import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

// The contact form's Company field: type-ahead over existing companies, with
// "Create <name>" when nothing matches.
//
// THE DEDUPE GUARD. Before offering to create, this asks the server whether a
// company with EXACTLY that name already exists (case-insensitively) and, if
// so, offers to link it instead. That check is a courtesy — the write path
// runs the same check inside its transaction, so two reps submitting the same
// new name at the same moment both end up linked to one company rather than
// creating twins. Warning here just means the rep finds out before saving
// instead of afterwards.
//
// The value is either a picked company (id + name) or a typed name that has
// not been resolved yet. Both are handed up: the caller sends company_id when
// there is one and company_name when there is not, and the server decides.

export interface CompanySelection {
  id: string | null
  name: string
}

interface Props {
  value: CompanySelection
  onChange: (v: CompanySelection) => void
  label?: string
}

interface Hit { id: string; name: string }

export function CompanyField({ value, onChange, label = 'Company' }: Props) {
  const [results, setResults] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [dupe, setDupe] = useState<Hit | null>(null)
  const wrap = useRef<HTMLDivElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Search, and in the same pass ask whether the typed name is an exact
  // existing one. Debounced together so typing costs at most two requests per
  // pause rather than two per keystroke.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const q = value.name.trim()
    if (value.id || q.length < 2) { setResults([]); setDupe(null); return }
    timer.current = setTimeout(() => {
      void api.companies({ q, page_size: 6 })
        .then((r) => setResults(r.companies.map((c) => ({ id: c.id, name: c.name }))))
        .catch(() => setResults([]))
      void api.companyByName(q)
        .then((r) => setDupe(r.match))
        .catch(() => setDupe(null))
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value.name, value.id])

  const typed = value.name.trim()
  // Only offer creation when nothing has that exact name. `dupe` is what makes
  // this a guard rather than a suggestion.
  const canCreate = !value.id && typed.length >= 2 && !dupe

  if (value.id) {
    return (
      <div className="cf-wrap">
        <label className="cchips-label">{label}</label>
        <div className="cf-picked">
          <span>{value.name}</span>
          <button type="button" className="linklike"
                  onClick={() => { onChange({ id: null, name: '' }); setOpen(true) }}>
            Change
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="cf-wrap" ref={wrap}>
      <label className="cchips-label">{label}</label>
      <input className="plat-input" style={{ marginBottom: 0 }}
             placeholder="Search or type a new company…"
             value={value.name}
             onChange={(e) => { onChange({ id: null, name: e.target.value }); setOpen(true) }}
             onFocus={() => setOpen(true)} />

      {/* The warning stays visible whether or not the menu is open: it is the
          thing the rep most needs to see before they hit Save. */}
      {dupe && (
        <div className="cf-dupe">
          <b>{dupe.name}</b> already exists.{' '}
          <button type="button" className="linklike"
                  onClick={() => { onChange({ id: dupe.id, name: dupe.name }); setOpen(false) }}>
            Use it
          </button>{' '}
          — saving as typed will link to it rather than create a second one.
        </div>
      )}

      {open && (results.length > 0 || canCreate) && (
        <div className="cf-menu">
          {results.map((r) => (
            <button type="button" key={r.id} className="cf-opt"
                    onClick={() => { onChange({ id: r.id, name: r.name }); setOpen(false) }}>
              {r.name}
            </button>
          ))}
          {canCreate && (
            <button type="button" className="cf-opt create"
                    onClick={() => setOpen(false)}>
              + Create “{typed}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
