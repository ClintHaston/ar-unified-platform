import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'

// The phone topbar collapses to brand + search, per spec. This is the one
// thing that could not collapse with it: sign-out.
//
// The desktop topbar spends most of its width on "Signed in as Clint Haston
// (admin)" and a Sign out button. Neither fits on a phone, and neither belongs
// in a four-tab bar meant for the work. But a rep who cannot sign out on the
// device they installed the app to has a real problem — a shared truck iPad,
// a phone handed to somebody else — so it lives behind the avatar instead of
// disappearing. One tap to see who you are, two to leave.

interface Props {
  name: string
  role: string
  initials: string
  onSignOut: () => void
}

export function MobileAccountMenu({ name, role, initials, onSignOut }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="ws-macct" ref={wrap}>
      <button
        type="button"
        className="ws-macct-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${name}`}
        onClick={() => setOpen((o) => !o)}
      >
        {initials || <Icon name="user" size={18} />}
      </button>
      {open && (
        <div className="ws-macct-menu" role="menu">
          <div className="ws-macct-who">
            <b>{name}</b>
            <small>{role}</small>
          </div>
          <button type="button" role="menuitem" className="ws-macct-item"
                  onClick={() => { setOpen(false); onSignOut() }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
