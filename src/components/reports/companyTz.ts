import { api } from '../../lib/api'

// The company's day boundary.
//
// "Today" only means something in a timezone. This app already decided which
// one: the company_timezone setting, the same value the due-today KPI reads
// (a 5 PM Central due date is "today" until midnight Central). It is NOT the
// browser's timezone (a rep travelling would silently see a different day)
// and NOT UTC (which cuts the day at 7 PM Central).
//
// SOURCE (MYDAY_POLISH, 2026-08-04): GET /platform/my/timezone, which any
// member may read. This used to ask GET /platform/settings — admin-only — on a
// page reps have been able to open since the rep-dashboards build. A rep's
// request 403'd, the catch below swallowed it, and every date preset they
// touched was silently computed in UTC: 5-6 hours out from the boundary their
// own KPIs were counted on, and a "This week" that started on the wrong day
// for the first six hours of every Monday.
//
// Fetched once per page load and shared by every caller.

let cached: Promise<string> | null = null

export function companyTz(): Promise<string> {
  if (!cached) {
    cached = api.myTimezone()
      .then((r) => (r.timezone?.trim() ? r.timezone.trim() : 'UTC'))
      .catch(() => 'UTC')      // a settings hiccup must not break the filter bar
  }
  return cached
}

/** Today's calendar date in `tz`, as YYYY-MM-DD. en-CA formats exactly that. */
export function todayIn(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  } catch {
    // An unknown zone name should not throw the page away; fall back to local.
    return new Intl.DateTimeFormat('en-CA').format(new Date())
  }
}

// ── Calendar arithmetic on YYYY-MM-DD strings ──────────────────────────────
// Anchored at NOON UTC on purpose. Once a date has been resolved in the
// company timezone it is a calendar date and nothing else, so the arithmetic
// must not reintroduce a clock: parsing 'YYYY-MM-DD' at midnight and stepping
// by days lands on the previous day anywhere west of UTC, and a DST boundary
// does the same thing to a 24-hour offset. Noon is twelve hours from either
// edge, which no real offset or DST shift can cross.

function at(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`)
}

export function addDays(ymd: string, days: number): string {
  const d = at(ymd)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(ymd: string): number {
  const wd = at(ymd).getUTCDay()          // 0 = Sunday
  return wd === 0 ? 7 : wd
}

/** The Monday of the week `ymd` falls in. Weeks are Monday–Sunday, matching
 *  Postgres date_trunc('week') — which is what the goal gauge counts to and
 *  what the report registry's 'week' dimension buckets on. A Sunday-start week
 *  here would put the filter bar a day out from every number beside it. */
export function weekStart(ymd: string): string {
  return addDays(ymd, -(isoWeekday(ymd) - 1))
}
