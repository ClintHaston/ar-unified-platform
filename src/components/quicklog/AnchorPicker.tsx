import { useEffect, useRef, useState } from 'react'
import { api, type QuickLogAnchor, type QuickLogAnchorType,
         type SearchResult } from '../../lib/api'
import { TYPE_META } from '../GlobalSearch'

// "What is this about?" — the anchor step of the quick-log modal.
//
// It reuses GET /platform/search (the same endpoint behind the topbar search
// and Ctrl+K), so one query already returns units, deals, contacts and
// companies ranked by trigram similarity. No new endpoint, no second idea of
// what "matching" means.
//
// COMPANIES ARE FILTERED OUT. An activity anchors to a deal, contact, unit or
// buy-opp — platform.activities has no company column — so offering a company
// would produce a row the rep could pick and then not submit. Rather than fail
// at submit time, the list says so up front, once, under the input.

const DEBOUNCE = 200
const MIN_CHARS = 2

// The search types this modal can actually anchor to.
const ANCHORABLE: Partial<Record<SearchResult['type'], QuickLogAnchorType>> = {
  deal: 'deal', contact: 'contact', unit: 'unit',
}

interface Props {
  value: QuickLogAnchor | null
  onPick: (anchor: QuickLogAnchor | null) => void
  /** A task may be logged with nothing attached; a call or note may not. */
  optional?: boolean
  autoFocus?: boolean
}

export function AnchorPicker({ value, onPick, optional, autoFocus }: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(0)
  const [hidCompanies, setHidCompanies] = useState(false)
  const seq = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    const trimmed = q.trim()
    if (trimmed.length < MIN_CHARS) {
      setResults([]); setSearching(false); setHidCompanies(false); return
    }
    setSearching(true)
    const s = ++seq.current
    const t = setTimeout(() => {
      api.globalSearch(trimmed)
        .then((r) => {
          if (s !== seq.current) return
          setResults(r.results.filter((x) => ANCHORABLE[x.type]))
          setHidCompanies(r.results.some((x) => !ANCHORABLE[x.type]))
          setActive(0)
        })
        .catch(() => { if (s === seq.current) setResults([]) })
        .finally(() => { if (s === seq.current) setSearching(false) })
    }, DEBOUNCE)
    return () => clearTimeout(t)
  }, [q])

  function pick(r: SearchResult) {
    const type = ANCHORABLE[r.type]
    if (!type) return
    onPick({ type, id: r.id, label: r.title, subtitle: r.subtitle })
    setQ(''); setResults([])
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) pick(results[active]) }
  }

  if (value) {
    // A buy-opp can only arrive pre-anchored (the search does not return
    // them), and it keeps the buy teal the rest of the app gives buy-side
    // objects rather than borrowing the sell-side gold.
    const meta = value.type === 'buyer_opportunity'
      ? { label: 'Buy opp', pill: 'buy' }
      : TYPE_META[value.type]
    return (
      <div className="ql-anchor picked">
        <span className={`pill ${meta.pill}`}>{meta.label}</span>
        <span className="ql-anchor-name">
          {value.label}
          {value.subtitle && <small>{value.subtitle}</small>}
        </span>
        <button type="button" className="plat-btn ghost ql-anchor-clear"
                onClick={() => onPick(null)}>Change</button>
      </div>
    )
  }

  const showList = q.trim().length >= MIN_CHARS

  return (
    <div className="ql-anchor">
      <input
        ref={inputRef}
        className="plat-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={optional
          ? 'Attach a deal, contact or unit (optional)…'
          : 'Search a deal, contact or unit…'}
        aria-label="What is this about?"
      />
      {showList && (
        <div className="ql-anchor-list">
          {searching && results.length === 0 && (
            <div className="ql-anchor-empty">Searching…</div>
          )}
          {!searching && results.length === 0 && (
            <div className="ql-anchor-empty">
              Nothing matches. Try a deal name, a contact, or a unit number.
            </div>
          )}
          {results.map((r, i) => (
            <button
              type="button"
              key={`${r.type}-${r.id}`}
              className={`ql-anchor-item${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
            >
              <span className={`pill ${TYPE_META[r.type].pill}`}>{TYPE_META[r.type].label}</span>
              <span className="ql-anchor-name">
                {r.title}
                {r.subtitle && <small>{r.subtitle}</small>}
              </span>
            </button>
          ))}
          {hidCompanies && (
            <div className="ql-anchor-empty">
              Companies aren’t shown — activity attaches to a deal, contact or unit.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
