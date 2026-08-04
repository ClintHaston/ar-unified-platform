import { useCallback, useEffect, useState } from 'react'
import { api, type KpiDrillResult, type KpiMetric } from '../../lib/api'
import { DrillModal, PAGE } from './DrillPopup'

// KPI card drill-down (MYDAY_POLISH, 2026-08-04): click a card in the KPI row
// and see the records behind the number.
//
// It renders through DrillModal — the same shell the datapoint drill and the
// funnel stage drill use — because the server hands back the same drill shape.
// Three drills, one table, one pager, one set of Open links, and no third
// layout to keep in step with the other two.
//
// THE SUBTITLE IS THE SERVER'S. Which population a card is showing is the thing
// a rep gets wrong: open pipeline ignores the date window and calls do not,
// and a popup that did not say so would look like it was disagreeing with the
// card above it. The server knows which of its own clauses it applied, so it
// writes that line rather than this component guessing at it.

interface Props {
  metric: KpiMetric
  // The window the CARD was drawn with. Passing anything else would return a
  // count that does not reconcile with the number that was clicked.
  window: number
  label: string
  onClose: () => void
}

export function KpiDrillPopup({ metric, window: days, label, onClose }: Props) {
  const [data, setData] = useState<KpiDrillResult | null>(null)
  const [error, setError] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback((off: number) => {
    let live = true
    setLoading(true)
    api.kpiDrill(metric, days, PAGE, off)
      .then((r) => { if (live) { setData(r); setError('') } })
      .catch((e: unknown) => {
        if (live) {
          setData(null)
          setError(e instanceof Error ? e.message : 'Could not load these records.')
        }
      })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [metric, days])

  useEffect(() => load(offset), [load, offset])

  return (
    <DrillModal label={label} subtitle={data?.subtitle} data={data} error={error}
                loading={loading} offset={offset} onOffset={setOffset}
                onClose={onClose} />
  )
}
