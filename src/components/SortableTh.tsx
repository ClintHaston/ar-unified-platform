import { useMemo, useState, type ReactNode } from 'react'
import type { SortDir } from '../lib/api'

// Client-side table sort for the FULLY-LOADED surfaces (Inventory's 798 units,
// Tasks, Lists, Settings > Team). The paginated sets (Contacts, Companies,
// list members) already sort server-side through their allow-listed sort
// params - this is deliberately the same interaction (click a header, a-z then
// z-a, caret on the active column) so the app has ONE sorting behaviour with
// two implementations picked by where the data lives, not a second mechanism.

export interface ClientSortColumn<T> {
  key: string
  // The comparable value for a row. null sorts LAST in either direction, the
  // same rule the server side uses (NULLS LAST).
  value: (row: T) => string | number | null
  // Date-ish columns read better newest-first on the first click.
  descFirst?: boolean
}

export interface ClientSort<T> {
  sorted: T[]
  sort: string | null
  dir: SortDir
  toggle: (key: string) => void
}

export function useClientSort<T>(rows: T[], columns: ClientSortColumn<T>[]): ClientSort<T> {
  const [sort, setSort] = useState<string | null>(null)
  const [dir, setDir] = useState<SortDir>('asc')

  function toggle(key: string) {
    const col = columns.find((c) => c.key === key)
    if (!col) return
    if (sort === key) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(key)
      setDir(col.descFirst ? 'desc' : 'asc')
    }
  }

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort)
    if (!col) return rows
    const mul = dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = col.value(a)
      const vb = col.value(b)
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul
      return String(va).localeCompare(String(vb), undefined,
        { numeric: true, sensitivity: 'base' }) * mul
    })
  }, [rows, sort, dir, columns])

  return { sorted, sort, dir, toggle }
}

// The header cell, matching the Contacts/Companies markup exactly (.th-sort +
// .sort-caret) so every sortable table looks and behaves the same.
export function SortableTh({ colKey, sort, dir, toggle, children }: {
  colKey: string
  sort: string | null
  dir: SortDir
  toggle: (key: string) => void
  children: ReactNode
}) {
  return (
    <th className="th-sort" onClick={() => toggle(colKey)}>
      {children}
      {sort === colKey && <span className="sort-caret">{dir === 'asc' ? ' ▲' : ' ▼'}</span>}
    </th>
  )
}
