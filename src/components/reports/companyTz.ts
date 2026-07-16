import { api } from '../../lib/api'

// The company's day boundary.
//
// "Today" only means something in a timezone. This app already decided which
// one: the company_timezone setting, the same value the due-today KPI reads
// (a 5 PM Central due date is "today" until midnight Central). It is NOT the
// browser's timezone (an admin travelling would silently see a different day)
// and NOT UTC (which cuts the day at 7 PM Central).
//
// So the Today preset asks the server what the company timezone is rather than
// hardcoding "America/Chicago" here, which would drift the moment the setting
// changed. Reports and dashboards are both admin-only, so /platform/settings is
// readable. Fetched once per page load and shared by both callers.

let cached: Promise<string> | null = null

export function companyTz(): Promise<string> {
  if (!cached) {
    cached = api.settings()
      .then((r) => r.settings.find((s) => s.key === 'company_timezone')?.value)
      .then((v) => (typeof v === 'string' && v.trim() ? v.trim() : 'UTC'))
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
