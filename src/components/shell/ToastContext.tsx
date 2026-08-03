import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// Minimal toast system for optimistic-rollback feedback. Error toasts are the
// primary use (a mutation reverted); an info variant exists for confirmations.
//
// Quick-log build (2026-08-02 night) adds ONE optional action button. Two
// interactions in this app are only honest with one: completing a task needs
// an undo (the checkbox is one tap and the row vanishes), and clicking a phone
// number needs an offer to log the call — an offer, because auto-opening a
// logging modal every time someone taps a number is the behaviour reps
// disable the feature to escape.
//
// The action is a nudge, never a requirement: the toast still dismisses itself
// on the same timer whether or not it is used.

const DISMISS_MS = 4200
// An offer you have to read, decide on, and click deserves longer than a
// confirmation you only have to notice.
const ACTION_DISMISS_MS = 8000

interface ToastAction {
  label: string
  run: () => void
}

interface Toast {
  id: number
  kind: 'error' | 'info'
  title: string
  body?: string
  action?: ToastAction
}

interface ToastApi {
  error: (title: string, body?: string) => void
  info: (title: string, body?: string, action?: ToastAction) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const push = useCallback((kind: Toast['kind'], title: string, body?: string,
                            action?: ToastAction) => {
    const id = ++seq
    setToasts((t) => [...t, { id, kind, title, body, action }])
    setTimeout(() => dismiss(id), action ? ACTION_DISMISS_MS : DISMISS_MS)
  }, [dismiss])

  const api = useMemo<ToastApi>(() => ({
    error: (title, body) => push('error', title, body),
    info: (title, body, action) => push('info', title, body, action),
  }), [push])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="ws-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ws-toast${t.kind === 'error' ? ' err' : ''}`}>
            <div className="ws-toast-t">{t.title}</div>
            {t.body && <div className="ws-toast-b">{t.body}</div>}
            {t.action && (
              <button
                className="ws-toast-act"
                onClick={() => { dismiss(t.id); t.action?.run() }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  // A no-op fallback keeps components usable outside the provider (e.g. tests).
  return ctx ?? { error: () => undefined, info: () => undefined }
}
