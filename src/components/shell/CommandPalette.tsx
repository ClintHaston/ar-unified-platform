import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type SearchResult } from '../../lib/api'
import { resultPath, TYPE_META } from '../GlobalSearch'
import { useAuth } from '../../contexts/AuthContext'
import { NAV } from './navConfig'
import { Icon, type IconName } from './icons'

// Ctrl+K / ⌘K command bar. Two legs:
//   1. Search — reuses GET /platform/search (units/deals/contacts/companies),
//      same deep-link rules as the topbar search (incl. company → filtered
//      contact list). Buyer opps are not in /platform/search by design.
//   2. Commands — go-to navigation for every destination + the born-in-platform
//      quick-add create flows. Pure frontend; nothing new, nothing written.

const DEBOUNCE = 200
const MIN_CHARS = 2

interface Command {
  id: string
  label: string
  hint?: string
  icon: IconName
  run: () => void
}

interface Props {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  // Reset + focus on open
  useEffect(() => {
    if (open) {
      setQ(''); setResults([]); setActive(0)
      const t = setTimeout(() => inputRef.current?.focus(), 20)
      return () => clearTimeout(t)
    }
  }, [open])

  // Debounced server search
  useEffect(() => {
    const trimmed = q.trim()
    if (trimmed.length < MIN_CHARS) { setResults([]); setSearching(false); return }
    setSearching(true)
    const s = ++seq.current
    const t = setTimeout(() => {
      api.globalSearch(trimmed)
        .then((r) => { if (s === seq.current) setResults(r.results) })
        .catch(() => { if (s === seq.current) setResults([]) })
        .finally(() => { if (s === seq.current) setSearching(false) })
    }, DEBOUNCE)
    return () => clearTimeout(t)
  }, [q])

  const commands = useMemo<Command[]>(() => {
    const goto: Command[] = NAV
      .filter((n) => !n.adminOnly || isAdmin)
      .flatMap((n) => {
        const base: Command[] = [{
          id: `go-${n.key}`, label: `Go to ${n.label}`, hint: 'Navigate', icon: n.icon,
          run: () => navigate(n.path),
        }]
        const sub = (n.flyout?.items ?? [])
          .filter((f) => !f.adminOnly || isAdmin)
          .map((f) => ({
            id: `go-${n.key}-${f.label}`, label: `Go to ${f.label}`, hint: 'Navigate', icon: f.icon,
            run: () => navigate(f.path),
          }))
        return [...base, ...sub]
      })
    const create: Command[] = [
      { id: 'new-deal', label: 'New deal', hint: 'Create', icon: 'deal', run: () => navigate('/pipelines?new=1') },
      { id: 'new-contact', label: 'New contact', hint: 'Create', icon: 'contacts', run: () => navigate('/contacts?new=1') },
      { id: 'new-task', label: 'New task', hint: 'Create', icon: 'tasks', run: () => navigate('/tasks?new=1') },
      { id: 'new-buyop', label: 'New buy opp', hint: 'Create', icon: 'buyops', run: () => navigate('/buyer-opportunities?new=1') },
      { id: 'intake', label: 'Intake unit', hint: 'Create', icon: 'intake', run: () => navigate('/inventory/intake') },
    ]
    const all = [...create, ...goto]
    const needle = q.trim().toLowerCase()
    if (!needle) return all
    return all.filter((c) => c.label.toLowerCase().includes(needle))
  }, [q, isAdmin, navigate])

  // Flattened selectable list: search results first, then commands.
  const flat = useMemo(() => [
    ...results.map((r) => ({ type: 'search' as const, r })),
    ...commands.map((c) => ({ type: 'cmd' as const, c })),
  ], [results, commands])

  useEffect(() => { setActive(0) }, [q, results.length])

  function runIndex(i: number) {
    const item = flat[i]
    if (!item) return
    onClose()
    if (item.type === 'search') navigate(resultPath(item.r))
    else item.c.run()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); runIndex(active) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  if (!open) return null

  const showSearch = q.trim().length >= MIN_CHARS
  let idx = -1

  return (
    <div className="ws-overlay" onMouseDown={onClose}>
      <div className="ws-palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="ws-palette-in">
          <span className="ws-ic"><Icon name="search" size={18} /></span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search units, deals, contacts, companies — or jump to a page…"
            aria-label="Command palette input"
          />
          <span className="ws-esc">ESC</span>
        </div>

        <div className="ws-palette-body">
          {showSearch && (
            <>
              <div className="ws-palette-group">
                {searching ? 'Searching…' : `Results${results.length ? ` (${results.length})` : ''}`}
              </div>
              {results.length === 0 && !searching && (
                <div className="ws-palette-empty" style={{ padding: '10px 12px', textAlign: 'left' }}>No matches.</div>
              )}
              {results.map((r) => {
                idx++
                const here = idx
                return (
                  <div
                    key={`s-${r.type}-${r.id}`}
                    className={`ws-palette-item${here === active ? ' active' : ''}`}
                    onMouseEnter={() => setActive(here)}
                    onMouseDown={(e) => { e.preventDefault(); runIndex(here) }}
                  >
                    <span className={`pill ${TYPE_META[r.type].pill}`} style={{ flexShrink: 0 }}>{TYPE_META[r.type].label}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="ws-pi-title" style={{ display: 'block' }}>{r.title}</span>
                      {r.subtitle && <span className="ws-pi-sub" style={{ display: 'block' }}>{r.subtitle}</span>}
                    </span>
                  </div>
                )
              })}
            </>
          )}

          <div className="ws-palette-group">{q.trim() ? 'Commands' : 'Jump to & create'}</div>
          {commands.length === 0 ? (
            <div className="ws-palette-empty" style={{ padding: '10px 12px', textAlign: 'left' }}>No commands.</div>
          ) : commands.map((c) => {
            idx++
            const here = idx
            return (
              <div
                key={c.id}
                className={`ws-palette-item${here === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(here)}
                onMouseDown={(e) => { e.preventDefault(); runIndex(here) }}
              >
                <span className="ws-ic"><Icon name={c.icon} size={16} /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="ws-pi-title" style={{ display: 'block' }}>{c.label}</span>
                </span>
                {c.hint && <span className="ws-pi-sub" style={{ flexShrink: 0 }}>{c.hint}</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
