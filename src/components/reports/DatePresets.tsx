import { useEffect, useState } from 'react'
import { addDays, companyTz, todayIn, weekStart } from './companyTz'

// The date preset row (MYDAY_POLISH, 2026-08-04).
//
// Exactly five: Today, Yesterday, This week, Last week, Custom. It replaces
// the old Today / 30d / 90d / 12mo / All row everywhere that row appeared —
// the Reports page and every dashboard — because those were rolling offsets
// and this is a calendar. "Last week" is a thing a sales manager asks for;
// "the 90 days ending right now" is not.
//
// EVERY RANGE IS BOUNDED AND COMPUTED IN THE COMPANY TIMEZONE. The old row's
// presets were open-ended ("since X", no end bound); these all set both ends,
// so a range means the same thing tomorrow as it does today. The server reads
// the two dates back in that same timezone, which is the whole reason the
// timezone has to be asked for rather than assumed — see companyTz.
//
// WEEKS ARE MONDAY–SUNDAY, and the row says so in a tooltip rather than
// leaving it to be discovered. That matches date_trunc('week') and therefore
// the goal gauge's "calls this week" and the report registry's week buckets.
// A Sunday-start week in the filter bar would disagree with the numbers on the
// same screen.
//
// CUSTOM IS NOT A SIXTH RANGE. It is the from/to inputs, which the host page
// already renders — so this component does not own them. Pressing Custom hands
// focus back to the host's first input; typing in those inputs makes the row
// fall out of every preset by itself, because `active` is DERIVED from the
// current range rather than remembered. A remembered selection is how a row
// ends up claiming "This week" over a range somebody has since edited.

export type PresetKey = 'today' | 'yesterday' | 'this_week' | 'last_week'

export interface DateRange { start: string; end: string }

/** The four ranges, given today's date in the company timezone. Pure, so the
 *  week arithmetic can be reasoned about (and tested) without a clock. */
export function presetRanges(today: string): Record<PresetKey, DateRange> {
  const thisMonday = weekStart(today)
  const lastMonday = addDays(thisMonday, -7)
  return {
    today: { start: today, end: today },
    yesterday: { start: addDays(today, -1), end: addDays(today, -1) },
    // Both weeks run the full Monday–Sunday. The current week's remaining days
    // hold nothing yet, and a range whose shape changes as the week goes on is
    // one you cannot compare with the week before it.
    this_week: { start: thisMonday, end: addDays(thisMonday, 6) },
    last_week: { start: lastMonday, end: addDays(lastMonday, 6) },
  }
}

const LABELS: Array<{ key: PresetKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This week' },
  { key: 'last_week', label: 'Last week' },
]

const WEEK_HINT = 'Weeks run Monday to Sunday in the company timezone — the '
  + 'same boundary your goal gauge and weekly trends are counted on.'

interface Props {
  start: string
  end: string
  onChange: (range: DateRange) => void
  /** Called when Custom is pressed, so the host can focus its own From input.
   *  The inputs stay where they are: the dashboard header and the Reports page
   *  each style theirs for their own layout (the phone layer hooks one of
   *  them), and moving them in here would take that away from both. */
  onCustom?: () => void
}

export function DatePresets({ start, end, onChange, onCustom }: Props) {
  const [ranges, setRanges] = useState<Record<PresetKey, DateRange> | null>(null)

  useEffect(() => {
    let live = true
    companyTz()
      .then((tz) => { if (live) setRanges(presetRanges(todayIn(tz))) })
      .catch(() => undefined)     // the row simply shows nothing as active
    return () => { live = false }
  }, [])

  // Derived, never stored: whatever the range currently IS decides which
  // button is lit, so editing the inputs falls through to Custom on its own.
  const active = ranges
    ? (LABELS.find(({ key }) =>
        ranges[key].start === start && ranges[key].end === end)?.key ?? 'custom')
    : 'custom'

  return (
    <div className="roletoggle date-presets" title={WEEK_HINT}>
      {LABELS.map(({ key, label }) => (
        <button key={key} type="button"
                className={active === key ? 'active' : ''}
                aria-pressed={active === key}
                disabled={!ranges}
                title={key === 'this_week' || key === 'last_week' ? WEEK_HINT : undefined}
                onClick={() => ranges && onChange(ranges[key])}>
          {label}
        </button>
      ))}
      <button type="button"
              className={active === 'custom' ? 'active' : ''}
              aria-pressed={active === 'custom'}
              title="Pick your own from and to dates"
              onClick={onCustom}>
        Custom
      </button>
    </div>
  )
}
