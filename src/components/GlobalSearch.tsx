import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type SearchResult, type SearchResultType } from '../lib/api'

// Topbar global search (build step 3c-5): one server endpoint over units,
// deals, contacts, and companies — ranked by trigram similarity, typed rows
// deep-link to the right detail page. Companies have no detail page of
// their own; a company hit lands on the contact list filtered to it.

const SEARCH_DEBOUNCE_MS = 200
const MIN_CHARS = 2

export const TYPE_META: Record<SearchResultType, { label: string; pill: string }> = {
  unit: { label: 'Unit', pill: 'av' },
  deal: { label: 'Deal', pill: 'gold' },
  contact: { label: 'Contact', pill: 'trans' },
  company: { label: 'Company', pill: 'grey' },
}

// Company hits land on the company detail page. Shared with the command palette.
export function resultPath(r: SearchResult): string {
  switch (r.type) {
    case 'unit': return `/units/${r.id}`
    case 'deal': return `/deals/${r.id}`
    case 'contact': return `/contacts/${r.id}`
    case 'company': return `/companies/${r.id}`
  }
}

export function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    const trimmed = q.trim()
    if (trimmed.length < MIN_CHARS) {
      setResults([])
      setOpen(false)
      setSearching(false)
      return
    }
    setSearching(true)
    const seq = ++requestSeq.current
    const t = setTimeout(() => {
      api.globalSearch(trimmed)
        .then((res) => {
          if (seq !== requestSeq.current) return
          setResults(res.results)
          setOpen(true)
          setActive(-1)
        })
        .catch(() => { if (seq === requestSeq.current) setResults([]) })
        .finally(() => { if (seq === requestSeq.current) setSearching(false) })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  function go(r: SearchResult) {
    setOpen(false)
    setQ('')
    navigate(resultPath(r))
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = results[active >= 0 ? active : 0]
      if (pick) go(pick)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="gsearch" ref={boxRef}>
      <input
        placeholder="Search units, deals, contacts, companies…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (results.length > 0 && q.trim().length >= MIN_CHARS) setOpen(true) }}
        onKeyDown={onKeyDown}
        aria-label="Global search"
      />
      {open && (
        <div className="gsearch-drop">
          {results.length === 0 ? (
            <div className="gsearch-empty">{searching ? 'Searching…' : 'No matches.'}</div>
          ) : (
            <>
              {results.map((r, i) => (
                <div
                  key={`${r.type}-${r.id}`}
                  className={`gsearch-item${i === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); go(r) }}
                >
                  <span className={`pill ${TYPE_META[r.type].pill}`}>{TYPE_META[r.type].label}</span>
                  <span className="gs-title">{r.title}</span>
                  {r.subtitle && <span className="gs-sub">{r.subtitle}</span>}
                </div>
              ))}
              <div
                className="gsearch-item footer"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setOpen(false)
                  navigate(`/contacts?q=${encodeURIComponent(q.trim())}`)
                  setQ('')
                }}
              >
                Search all contacts for “{q.trim()}” →
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
