import { useCallback, useEffect, useState } from 'react'
import { api, type StageOccupantsResult } from '../../lib/api'
import { DrillModal, PAGE } from './DrillPopup'

// Funnel stage drill-down (DRILL_USERS, 2026-08-03): click a stage on any WS2a
// funnel and see WHO IS IN IT. Renders through DrillModal, the same shell the
// datapoint drill uses, because the server hands back the same drill shape.
//
// The subtitle is the whole reason this is a separate popup rather than a
// second call site: the funnel bar above it counts entries over a window, and
// this list counts occupants NOW. Leaving the two to be silently different
// numbers is how a rep decides the report is broken. So the popup says which
// population it is showing, every time, in the server's own counts.

interface Props {
  stageId: string
  // The funnel's own filters, so the drill matches what the bar was drawn
  // from. Passed as primitives, not as an object, so the load effect below
  // depends on values that only change when the filters actually change.
  start?: string
  end?: string
  ownerId?: string
  // "Sell funnel · Active"
  label: string
  onClose: () => void
}

/** What this list is, in one line. Open records ignore the date filters by
 *  design; closed ones are the set that closed INTO the stage in the window. */
export function stageSubtitle(d: StageOccupantsResult): string {
  const { open_total: open, closed_total: closed, date_filtered: dated } = d
  const now = `${open.toLocaleString()} in stage now`
  if (closed === 0) {
    return dated
      ? `${now} — dates do not apply to open records`
      : now
  }
  const closedPart = `${closed.toLocaleString()} closed into this stage${
    dated ? ' in the selected dates' : ''}`
  return open === 0 ? closedPart : `${now} · ${closedPart}`
}

export function StageDrillPopup({ stageId, start, end, ownerId, label, onClose }: Props) {
  const [data, setData] = useState<StageOccupantsResult | null>(null)
  const [error, setError] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback((off: number) => {
    let live = true
    setLoading(true)
    api.stageOccupants(stageId, { start, end, owner_id: ownerId }, PAGE, off)
      .then((r) => { if (live) { setData(r); setError('') } })
      .catch((e: unknown) => {
        if (live) {
          setData(null)
          setError(e instanceof Error ? e.message : 'Could not load this stage.')
        }
      })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [stageId, start, end, ownerId])

  useEffect(() => load(offset), [load, offset])

  return (
    <DrillModal label={label} subtitle={data ? stageSubtitle(data) : undefined}
                data={data} error={error} loading={loading}
                offset={offset} onOffset={setOffset} onClose={onClose} />
  )
}
