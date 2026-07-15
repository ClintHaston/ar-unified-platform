import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

// Lets a detail page publish its own leaf label (a company name, a segment
// name) so the breadcrumb can show it instead of a static fallback. The page
// calls useBreadcrumbTitle(name) once its record loads; the title clears on
// unmount so the next route starts from its static label. Purely display
// state, no data written.

interface BreadcrumbTitleApi {
  title: string | null
  setTitle: (title: string | null) => void
}

const BreadcrumbTitleContext = createContext<BreadcrumbTitleApi | null>(null)

export function BreadcrumbTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null)
  const value = useMemo(() => ({ title, setTitle }), [title])
  return <BreadcrumbTitleContext.Provider value={value}>{children}</BreadcrumbTitleContext.Provider>
}

// Read the current published leaf title (null when none). Used by Breadcrumbs.
export function useBreadcrumbTitleValue(): string | null {
  return useContext(BreadcrumbTitleContext)?.title ?? null
}

// Publish this page's leaf title. Falls back to nothing when the name is empty
// or not yet loaded, and clears on unmount.
export function useBreadcrumbTitle(title: string | null | undefined): void {
  const ctx = useContext(BreadcrumbTitleContext)
  useEffect(() => {
    if (!ctx) return
    ctx.setTitle(title && title.trim() ? title : null)
    return () => ctx.setTitle(null)
  }, [ctx, title])
}
