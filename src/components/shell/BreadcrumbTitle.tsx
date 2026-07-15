import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// Lets a detail page publish its own leaf label (a company name, a segment
// name) so the breadcrumb shows it instead of a static fallback. The page calls
// useBreadcrumbTitle(name) once its record loads; the title clears on unmount.
//
// Two separate contexts on purpose: the VALUE changes as the title changes, but
// the SETTER is the identity-stable useState dispatcher. useBreadcrumbTitle only
// depends on the setter (stable) and the title arg (a primitive), so its effect
// runs exactly once per real title change — no re-render loop. (An earlier
// single-context version memoized {title,setTitle} on [title], so the context
// object changed every update, the hook's effect re-ran, and its cleanup+set
// toggled the title back and forth: a render storm that froze detail pages.)

const TitleValueContext = createContext<string | null>(null)
const SetTitleContext = createContext<(title: string | null) => void>(() => {})

export function BreadcrumbTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null)
  return (
    <SetTitleContext.Provider value={setTitle}>
      <TitleValueContext.Provider value={title}>{children}</TitleValueContext.Provider>
    </SetTitleContext.Provider>
  )
}

// Read the current published leaf title (null when none). Used by Breadcrumbs.
export function useBreadcrumbTitleValue(): string | null {
  return useContext(TitleValueContext)
}

// Publish this page's leaf title. Empty/whitespace/undefined publishes nothing
// (breadcrumb keeps its static fallback), and the title clears on unmount.
export function useBreadcrumbTitle(title: string | null | undefined): void {
  const setTitle = useContext(SetTitleContext)
  useEffect(() => {
    setTitle(title && title.trim() ? title : null)
    return () => setTitle(null)
  }, [title, setTitle])
}
