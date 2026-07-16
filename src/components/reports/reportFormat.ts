// Shared value formatting for the report builder result views (table, number,
// and every chart). Money columns (type 'cents') render as whole dollars.
export function fmt(value: string | number | null, type: string): string {
  if (value === null || value === undefined) return '-'
  if (type === 'cents') return `$${(Number(value) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  if (type === 'number') return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (type === 'int') return Number(value).toLocaleString()
  // 'date' arrives as an ISO timestamp from the drill's detail projection. Show
  // the day only: a record list is scanned, not read to the second.
  if (type === 'date') {
    const d = new Date(String(value))
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString()
  }
  return String(value)
}
