// InstallCoach — because iOS Safari never prompts. Chrome/Android fire
// beforeinstallprompt (we offer a real Install button); iPhone/iPad users
// must be walked to Share -> Add to Home Screen, so we coach them once.
// Hidden when already installed (standalone) or after dismissal.
import { useEffect, useState } from 'react'

const DISMISS_KEY = 'ar-install-coach-dismissed'

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function InstallCoach() {
  const [deferred, setDeferred] = useState<{ prompt: () => Promise<unknown> } | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return
    if (isIos()) { setShow(true); return }
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as unknown as { prompt: () => Promise<unknown> })
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!show) return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  return (
    <div className="install-coach" role="dialog" aria-label="Install the app">
      {isIos() ? (
        <span className="ic-text">
          Install this app: tap <span className="ic-share" aria-label="Share">&#x2191;&#xFE0E;</span> Share,
          then <strong>Add to Home Screen</strong>
        </span>
      ) : (
        <span className="ic-text">Get the app on your home screen</span>
      )}
      {!isIos() && deferred && (
        <button className="plat-btn" onClick={() => { deferred.prompt().finally(dismiss) }}>
          Install
        </button>
      )}
      <button className="ic-close" onClick={dismiss} aria-label="Dismiss">&#x2715;</button>
    </div>
  )
}
