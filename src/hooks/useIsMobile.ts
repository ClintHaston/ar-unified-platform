import { useEffect, useState } from 'react'

// The one place the phone breakpoint is defined.
//
// It exists as a hook, and not only as a CSS media query, because two of the
// four screens need a DIFFERENT COMPONENT on a phone, not a restyled one. The
// Contacts list is a nine-column table and the Tasks list is a four-column
// one; there is no width at which those become thumb-friendly by CSS alone, so
// the mobile build renders cards instead. Layout that CAN be done in CSS still
// is — see mobile.css — because CSS reflows on rotate without a re-render.
//
// 767px, matching the spec's "< 768px". Kept in sync with MOBILE_MAX in
// mobile.css by hand; there is one number and it is written down twice, which
// is cheaper than a build step to share it.
export const MOBILE_MAX_PX = 767
const QUERY = `(max-width: ${MOBILE_MAX_PX}px)`

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    // Re-read on mount: a resize between the initial state and this effect
    // (rotating the phone during boot) would otherwise be missed.
    setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
