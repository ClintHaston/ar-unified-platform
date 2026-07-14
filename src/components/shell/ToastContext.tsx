import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// Minimal toast system for optimistic-rollback feedback. Error toasts are the
// primary use (a mutation reverted); an info variant exists for confirmations.

interface Toast {
  id: number
  kind: 'error' | 'info'
  title: string
  body?: string
}

interface ToastApi {
  error: (title: string, body?: string) => void
  info: (title: string, body?: string) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((kind: Toast['kind'], title: string, body?: string) => {
    const id = ++seq
    setToasts((t) => [...t, { id, kind, title, body }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  const api = useMemo<ToastApi>(() => ({
    error: (title, body) => push('error', title, body),
    info: (title, body) => push('info', title, body),
  }), [push])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="ws-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ws-toast${t.kind === 'error' ? ' err' : ''}`}>
            <div className="ws-toast-t">{t.title}</div>
            {t.body && <div className="ws-toast-b">{t.body}</div>}
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
