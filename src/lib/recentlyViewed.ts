// Client-side "recently viewed" list for the activity rail. Purely local
// (sessionStorage) — no endpoint, no server write. Records detail-page visits
// (deal / unit / contact / buy opp) with a label captured from the page.

export type RecentKind = 'deal' | 'unit' | 'contact' | 'buyop'

export interface RecentItem {
  kind: RecentKind
  id: string
  label: string
  at: number
}

const KEY = 'ws_recently_viewed'
const MAX = 8

export function recordRecent(kind: RecentKind, id: string, label: string): void {
  if (!id || !label) return
  try {
    const list = readRecent().filter((r) => !(r.kind === kind && r.id === id))
    list.unshift({ kind, id, label, at: Date.now() })
    sessionStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* storage unavailable — silently skip */
  }
}

export function readRecent(): RecentItem[] {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RecentItem[]) : []
  } catch {
    return []
  }
}

export function recentPath(r: RecentItem): string {
  switch (r.kind) {
    case 'deal': return `/deals/${r.id}`
    case 'unit': return `/units/${r.id}`
    case 'contact': return `/contacts/${r.id}`
    case 'buyop': return `/buyer-opportunities/${r.id}`
  }
}
