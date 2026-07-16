type Row = Record<string, string | number | null>
type Raw = string | number | null

export interface PivotResult {
  data: Row[]
  seriesValues: string[]
  // Display value -> the RAW value it came from. The pivot has to stringify to
  // key its rows, which turns a genuine null category into the string '-'. A
  // drill filtering on '-' would match nothing, so the raw value has to survive
  // the reshape: the chart renders the display string and drills the raw value.
  rawCategory: Record<string, Raw>
  rawSeries: Record<string, Raw>
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
  const rawCategory: Record<string, Raw> = {}
  const rawSeries: Record<string, Raw> = {}

  for (const r of rows) {
    const cat = String(r[categoryKey] ?? '-')
    const sv = String(r[seriesKey] ?? '-')
    if (!byCat.has(cat)) {
      byCat.set(cat, { [categoryKey]: cat })
      order.push(cat)
      rawCategory[cat] = r[categoryKey] ?? null
    }
    if (!seriesValues.includes(sv)) {
      seriesValues.push(sv)
      rawSeries[sv] = r[seriesKey] ?? null
    }
    byCat.get(cat)![sv] = Number(r[measureKey] ?? 0)
  }

  const data = order.map((cat) => {
    const row = byCat.get(cat)!
    for (const sv of seriesValues) if (!(sv in row)) row[sv] = 0
    return row
  })
  return { data, seriesValues, rawCategory, rawSeries }
}
