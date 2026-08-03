import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { QuickLogAnchor } from '../../lib/api'
import { QuickLogModal } from './QuickLogModal'

// Quick log — the single "open the log form" entry point for the whole app.
//
// Logging has to be reachable from places that know nothing about each other:
// the topbar + menu, the Ctrl+K palette, a deal page, a contact page, the "Up
// next" empty state, and the toast that appears after tapping a phone number.
// If each of those owned its own modal there would be six log forms drifting
// apart, so there is one, mounted once here, and everyone else calls openCall /
// openNote / openTask.
//
// PRE-ANCHORING is why the anchor is a parameter rather than always a search.
// Standing on a deal page, the deal IS the answer to "what is this about?" —
// asking again would be the navigation tax this whole build exists to remove.
//
// `logVersion` is the refetch signal. A successful log bumps it; anything
// showing logged data (the My Day feed, Up next) watches it and reloads. A
// counter rather than a callback registry because the surfaces that care are
// already re-rendering — they need to know THAT something was logged, not what.

type Mode = 'call' | 'note' | 'task'

interface OpenState {
  mode: Mode
  anchor: QuickLogAnchor | null
}

interface QuickLogApi {
  openCall: (anchor?: QuickLogAnchor | null) => void
  openNote: (anchor?: QuickLogAnchor | null) => void
  openTask: (anchor?: QuickLogAnchor | null) => void
  /** Bumped after every successful log or task create. */
  logVersion: number
  /** For surfaces that mutate logged data themselves (e.g. completing a task). */
  bumpLogVersion: () => void
}

const QuickLogCtx = createContext<QuickLogApi | null>(null)

export function QuickLogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenState | null>(null)
  const [logVersion, setLogVersion] = useState(0)

  const bumpLogVersion = useCallback(() => setLogVersion((v) => v + 1), [])

  const api = useMemo<QuickLogApi>(() => ({
    openCall: (anchor) => setOpen({ mode: 'call', anchor: anchor ?? null }),
    openNote: (anchor) => setOpen({ mode: 'note', anchor: anchor ?? null }),
    openTask: (anchor) => setOpen({ mode: 'task', anchor: anchor ?? null }),
    logVersion,
    bumpLogVersion,
  }), [logVersion, bumpLogVersion])

  return (
    <QuickLogCtx.Provider value={api}>
      {children}
      {open && (
        <QuickLogModal
          mode={open.mode}
          anchor={open.anchor}
          onClose={() => setOpen(null)}
          onLogged={bumpLogVersion}
        />
      )}
    </QuickLogCtx.Provider>
  )
}

export function useQuickLog(): QuickLogApi {
  const ctx = useContext(QuickLogCtx)
  // A no-op fallback keeps components mountable outside the provider, matching
  // how useToast behaves.
  return ctx ?? {
    openCall: () => undefined, openNote: () => undefined,
    openTask: () => undefined, logVersion: 0, bumpLogVersion: () => undefined,
  }
}
