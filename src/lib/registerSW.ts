// Service-worker registration and the update handshake.
//
// The spec's requirement is "new deploy -> SW updates on next open, no manual
// steps". That is skipWaiting on the worker's side plus, here, one reload when
// the new worker takes over — because the tab is still running the OLD bundle
// at that moment, and a rep looking at last week's code while the worker serves
// this week's assets is the exact confusion the update flow exists to avoid.
//
// THE RELOAD IS FUSED. `SESSION_RELOAD_KEY` in sessionStorage means the reload
// happens at most once per tab. A service worker that fails to activate cleanly
// could otherwise fire controllerchange repeatedly, and an unfused reload turns
// that into an app that flickers forever — on a rep's phone, in a truck, with
// no way out but uninstalling. One reload, then never again this session.
//
// The FIRST controller is not an update. On a first-ever visit the worker
// installs and claims a page that already has the current bundle; reloading
// there would be a flash of nothing for no reason.

const SESSION_RELOAD_KEY = 'ar_sw_reloaded'
const TOAST_KEY = 'ar_sw_refreshed'

/** Set by registerSW when this load was caused by a worker update. */
export function consumeRefreshedFlag(): boolean {
  if (sessionStorage.getItem(TOAST_KEY) !== '1') return false
  sessionStorage.removeItem(TOAST_KEY)
  return true
}

/** Tell the worker to drop any API responses it is holding (sign-out). */
export function notifyLogout(): void {
  navigator.serviceWorker?.controller?.postMessage({ type: 'logout' })
}

export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return
  // Dev runs unregistered on purpose: a cache-first worker in front of Vite's
  // HMR is a debugging session spent chasing your own stale assets.
  if (!import.meta.env.PROD) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Every launch is a new session as far as cached API data is concerned.
      const tellSession = () =>
        navigator.serviceWorker.controller?.postMessage({ type: 'session-start' })
      tellSession()
      // A worker claiming this page after registration missed the message above.
      navigator.serviceWorker.ready.then(tellSession)

      // Re-check on return to the app: a rep who leaves the PWA open for days
      // would otherwise never look for a new deploy.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => undefined)
      })
    }).catch(() => undefined)

    const hadController = Boolean(navigator.serviceWorker.controller)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return                              // first install
      if (sessionStorage.getItem(SESSION_RELOAD_KEY) === '1') return
      sessionStorage.setItem(SESSION_RELOAD_KEY, '1')
      sessionStorage.setItem(TOAST_KEY, '1')
      window.location.reload()
    })
  })
}
