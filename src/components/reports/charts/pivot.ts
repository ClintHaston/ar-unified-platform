type Row = Record<string, string | number | null>

export interface PivotResult {
  data: Row[]
  seriesValues: string[]
}

// Reshape the engine's long rows ({category, series, measure}) into wide chart
// rows ({category, [seriesValue]: measure, ...}). Category and series order
// follow first appearance (the engine already orders by category, then series).
// Missing cells are filled with 0 so stacks and groups render cleanly.
export function pivotSeries(
  rows: Row[],
  categoryKey: string,
  seriesKey: string,
  measureKey: string,
): PivotResult {
  const order: string[] = []
  const byCat = new Map<string, Row>()
  const seriesValues: string[] = []

  for (const r of rows) {
    const cat = String(r[categoryKey] ?? '—')
    const sv = String(r[seriesKey] ?? '—')
    if (!byCat.has(cat)) {
      byCat.set(cat, { [categoryKey]: cat })
      order.push(cat)
    }
    if (!seriesValues.includes(sv)) seriesValues.push(sv)
    byCat.get(cat)![sv] = Number(r[measureKey] ?? 0)
  }

  const data = order.map((cat) => {
    const row = byCat.get(cat)!
    for (const sv of seriesValues) if (!(sv in row)) row[sv] = 0
    return row
  })
  return { data, seriesValues }
}
