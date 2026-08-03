import type { QuickLogAnchor } from '../../lib/api'
import { useQuickLog } from './QuickLogContext'
import { useToast } from '../shell/ToastContext'

// Click-to-call and click-to-email.
//
// A phone number rendered as plain text is a number a rep has to retype into
// their phone. Making it a tel: link costs nothing and removes that step
// everywhere at once — which is why this is a shared component rather than a
// sweep of one-off <a href={`tel:${x}`}> tags: the moment there are twenty of
// them, nineteen never get the follow-up behaviour below.
//
// THE FOLLOW-UP IS AN OFFER, NOT AN INTERRUPTION. Auto-opening the log modal
// after every tap would fire on a misclick, on a number copied for a colleague,
// on the third redial of a line that keeps ringing out — and a modal you have
// to dismiss several times an hour is a feature reps route around. Instead a
// toast appears with one button. Ignore it and it goes away on its own.
//
// The offer only appears where the caller passed an `anchor`. Without one the
// modal would open on a search box, which is a worse place to land than the
// page the rep was already on.

interface TelProps {
  phone: string | null | undefined
  /** What a call to this number would be logged against, if anything. */
  anchor?: QuickLogAnchor | null
  /** Rendered when there is no number. */
  empty?: string
  className?: string
}

// Digits, plus, and a leading extension marker survive; everything else is
// punctuation for humans and confuses a dialler.
function telHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+;,*#]/g, '')
  return `tel:${cleaned || phone}`
}

export function Tel({ phone, anchor, empty = '—', className }: TelProps) {
  const quickLog = useQuickLog()
  const toast = useToast()
  const value = (phone ?? '').trim()
  if (!value) return <span className={className}>{empty}</span>

  function offerToLog() {
    if (!anchor) return
    toast.info('Did you reach them?',
               `Log the call against ${anchor.label} while it's fresh.`,
               { label: 'Log call', run: () => quickLog.openCall(anchor) })
  }

  return (
    <a
      href={telHref(value)}
      className={className}
      // Click, not onAuxClick or onFocus: the offer follows the ACT of calling.
      onClick={(e) => { e.stopPropagation(); offerToLog() }}
    >
      {value}
    </a>
  )
}

interface MailtoProps {
  email: string | null | undefined
  empty?: string
  className?: string
}

// Email gets no log offer. Outbound email is already captured by the BCC
// ingest, so prompting to log it by hand would invite duplicate rows for the
// same message — the one thing the ingest's dedupe exists to prevent.
export function Mailto({ email, empty = '—', className }: MailtoProps) {
  const value = (email ?? '').trim()
  if (!value) return <span className={className}>{empty}</span>
  return (
    <a href={`mailto:${value}`} className={className}
       onClick={(e) => e.stopPropagation()}>
      {value}
    </a>
  )
}
