import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuickLog } from '../quicklog/QuickLogContext'
import { useToast } from './ToastContext'
import { consumeRefreshedFlag } from '../../lib/registerSW'

// Two PWA behaviours that need the toast and quick-log layers, so they live in
// a child of the providers rather than in AppShell itself. Renders nothing.
//
//   * THE REFRESH TOAST. A service-worker update reloads the tab (see
//     registerSW). A reload nobody explained reads as a crash, so the reload
//     leaves a flag and this says what happened, once, quietly.
//   * THE MANIFEST SHORTCUT. Long-pressing the installed icon offers "Log a
//     call", which opens /?log=call. Without this that URL is just the home
//     screen and the shortcut is a lie. The param is stripped immediately so a
//     refresh does not reopen the form.

export function ShellEffects() {
  const toast = useToast()
  const quickLog = useQuickLog()
  const [params, setParams] = useSearchParams()
  const shownRefresh = useRef(false)
  const handledLog = useRef(false)

  useEffect(() => {
    if (shownRefresh.current) return
    shownRefresh.current = true
    if (consumeRefreshedFlag()) {
      toast.info('Refreshed', 'You are on the latest version.')
    }
  }, [toast])

  const log = params.get('log')
  useEffect(() => {
    if (!log || handledLog.current) return
    handledLog.current = true
    params.delete('log')
    setParams(params, { replace: true })
    if (log === 'note') quickLog.openNote()
    else if (log === 'task') quickLog.openTask()
    else quickLog.openCall()
  }, [log, params, setParams, quickLog])

  return null
}
