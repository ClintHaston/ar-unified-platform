// MyDayPanels — the rep-dashboard experience layer (v2, 2026-08-02 evening).
// v1 was accurate and dead. v2 answers the two questions a morning screen is
// for: "how am I doing?" (trend deltas vs the previous window, count-up
// numbers, win/loss context) and "what do I touch next?" (every card is a
// door, urgency states light up, the feed reads like a story of the day).
// All motion sits behind prefers-reduced-motion. Site design system only.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import type { MyKpis, ActivityFeedResult, FeedGroup, FeedItem, KpiMetric } from '../../lib/api'
import { KpiDrillPopup } from './KpiDrillPopup'

const money = (cents: number) =>
  '$' + Math.round(cents / 100).toLocaleString()

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Count-up: eases a number from 0 on mount. Skipped entirely under reduced
// motion, and any non-finite value just renders as-is.
function useCountUp(target: number, ms = 650): number {
  const [value, setValue] = useState(reducedMotion() ? target : 0)
  const done = useRef(false)
  useEffect(() => {
    if (done.current || reducedMotion()) { setValue(target); return }
    done.current = true
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const eased = 1 - Math.pow(1 - k, 3)
      setValue(Math.round(target * eased))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return value
}

function Delta({ now, prev, goodUp = true, label }: {
  now: number; prev: number | undefined; goodUp?: boolean; label: string
}) {
  if (prev === undefined) return null
  const diff = now - prev
  if (diff === 0) {
    return <span className="kpi-delta flat">— even with {label}</span>
  }
  const up = diff > 0
  const good = up === goodUp
  return (
    <span className={`kpi-delta ${good ? 'good' : 'bad'}`}>
      {up ? '▲' : '▼'} {Math.abs(diff).toLocaleString()} vs {label}
    </span>
  )
}

function Hero({ data }: { data: MyKpis }) {
  const { user } = useAuth()
  const h = new Date().getHours()
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  const first = (user?.name ?? '').split(' ')[0] || 'there'
  const bits: string[] = []
  if (data.tasks_due_today > 0) {
    bits.push(`${data.tasks_due_today} task${data.tasks_due_today === 1 ? '' : 's'} due today`)
  }
  if (data.calls > 0) bits.push(`${data.calls} calls in the last ${data.window_days} days`)
  if (data.won > 0) bits.push(`${data.won} won this window`)
  if (bits.length === 0 && data.stale_deals > 0) {
    bits.push(`${data.stale_deals.toLocaleString()} stalled deals could use a touch`)
  }
  const today = new Date().toLocaleDateString(undefined,
    { weekday: 'long', month: 'long', day: 'numeric' })
  return (
    <div className="myday-hero">
      <div className="myday-greet bebas">{greet}, {first}</div>
      <div className="myday-sub">
        {today}{bits.length ? ' · ' + bits.join(' · ') : ' · a clean slate — go make some noise'}
      </div>
    </div>
  )
}

// A card OPENS ITS NUMBER (MYDAY_POLISH, 2026-08-04).
//
// It used to be a <Link>, and that is the bug Clint hit: three of the eight
// pointed at /deals, which is not a route this app declares. React Router's
// catch-all sent every one of those clicks to "/", the landing route redirected
// to the user's default dashboard, and the card read as "bounces back to My
// Day". A KPI is a COUNT though, and no single page is the answer to a count —
// so the fix is not a better href, it is the drill the rest of the reporting
// layer already uses: here are the records behind this number.
function Card({ metric, accent, urgent, onOpen, children }: {
  metric: KpiMetric
  accent?: 'gold' | 'teal' | 'warn'
  urgent?: boolean
  onOpen: (metric: KpiMetric) => void
  children: React.ReactNode
}) {
  return (
    <button type="button"
            className={`kpi-card${accent ? ` ac-${accent}` : ''}${urgent ? ' urgent' : ''}`}
            onClick={() => onOpen(metric)}>
      {children}
    </button>
  )
}

function Value({ children }: { children: React.ReactNode }) {
  return <div className="kpi-value">{children}</div>
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="kpi-label">{children}</div>
}

// What each card's drill is called in the popup heading. Kept here rather than
// on the server so the heading reads like the card the user just clicked
// ("Win rate · 3W 1L" -> "Win rate"), while the server owns the SUBTITLE, which
// is about which population it queried.
const METRIC_LABEL: Record<KpiMetric, string> = {
  open_pipeline: 'Open pipeline', weighted_pipeline: 'Weighted pipeline',
  win_rate: 'Win rate', avg_days_to_close: 'Avg days to close',
  calls: 'Calls', emails: 'Emails', tasks_due_today: 'Tasks due today',
  stale_deals: 'Stale deals',
}

export function KpiRow({ data }: { data: MyKpis }) {
  const win = data.window_days
  const [drill, setDrill] = useState<KpiMetric | null>(null)
  const openC = useCountUp(data.open_pipeline_cents)
  const weightC = useCountUp(data.weighted_pipeline_cents)
  const calls = useCountUp(data.calls)
  const emails = useCountUp(data.emails)
  const closes = data.won + data.lost
  const prevCloses = (data.won_prev ?? 0) + (data.lost_prev ?? 0)
  const prevRate = prevCloses > 0 ? (data.won_prev ?? 0) / prevCloses : undefined
  const prior = `prior ${win}d`
  return (
    <div>
      <Hero data={data} />
      <div className="kpi-row">
        <Card metric="open_pipeline" onOpen={setDrill} accent="gold">
          <Value>{money(openC)}</Value>
          <Lbl>Open pipeline</Lbl>
          {(data.won_value_cents ?? 0) === 0 && (data.won_value_prev_cents ?? 0) === 0 ? (
            <span className="kpi-delta flat">nothing closed-won yet this window</span>
          ) : (
            <span className={`kpi-delta ${(data.won_value_cents ?? 0) >= (data.won_value_prev_cents ?? 0) ? 'good' : 'bad'}`}>
              {money(data.won_value_cents ?? 0)} won · {(data.won_value_cents ?? 0) >= (data.won_value_prev_cents ?? 0) ? '▲' : '▼'} vs {prior}
            </span>
          )}
        </Card>
        <Card metric="weighted_pipeline" onOpen={setDrill} accent="gold">
          <Value>{money(weightC)}</Value>
          <Lbl>Weighted pipeline</Lbl>
          <span className="kpi-delta flat">expected value at stage odds</span>
        </Card>
        <Card metric="win_rate" onOpen={setDrill} accent="teal">
          <Value>
            {data.win_rate === null
              ? <span className="kpi-empty">no closes yet</span>
              : `${Math.round(data.win_rate * 100)}%`}
          </Value>
          <Lbl>Win rate · {data.won}W {data.lost}L</Lbl>
          {data.win_rate !== null && prevRate !== undefined && (
            <span className={`kpi-delta ${data.win_rate >= prevRate ? 'good' : 'bad'}`}>
              {data.win_rate >= prevRate ? '▲' : '▼'} {Math.abs(Math.round((data.win_rate - prevRate) * 100))} pts vs {prior}
            </span>
          )}
        </Card>
        <Card metric="avg_days_to_close" onOpen={setDrill} accent="teal">
          <Value>
            {data.avg_days_to_close === null
              ? <span className="kpi-empty">waiting on wins</span>
              : data.avg_days_to_close.toFixed(0)}
          </Value>
          <Lbl>Avg days to close</Lbl>
          <span className="kpi-delta flat">{closes ? `${closes} closes this window` : 'closes will fill this in'}</span>
        </Card>
        <Card metric="calls" onOpen={setDrill}>
          <Value>{calls}</Value>
          <Lbl>Calls</Lbl>
          <Delta now={data.calls} prev={data.calls_prev} label={prior} />
        </Card>
        <Card metric="emails" onOpen={setDrill}>
          <Value>{emails}</Value>
          <Lbl>Emails</Lbl>
          <Delta now={data.emails} prev={data.emails_prev} label={prior} />
        </Card>
        <Card metric="tasks_due_today" onOpen={setDrill} urgent={data.tasks_due_today > 0}>
          <Value>{data.tasks_due_today}</Value>
          <Lbl>Tasks due today</Lbl>
          <span className="kpi-delta flat">
            {data.tasks_due_today > 0 ? 'knock these out first' : 'all clear'}
          </span>
        </Card>
        <Card metric="stale_deals" onOpen={setDrill}
              accent={data.stale_deals > 0 ? 'warn' : undefined}>
          <Value>{data.stale_deals.toLocaleString()}</Value>
          <Lbl>Stale deals</Lbl>
          <span className="kpi-delta flat">
            {data.stale_deals > 0 ? 'no movement in a while — pick three' : 'nothing gathering dust'}
          </span>
        </Card>
        <div className="kpi-window">last {win} days</div>
      </div>
      {/* The window the CARDS were drawn with rides into the drill, so the
          popup's total reconciles with the number that was clicked. */}
      {drill && (
        <KpiDrillPopup metric={drill} window={win} label={METRIC_LABEL[drill]}
                       onClose={() => setDrill(null)} />
      )}
    </div>
  )
}

const KIND_META: Record<string, { glyph: string; cls: string }> = {
  call: { glyph: '📞', cls: 'call' },
  email: { glyph: '✉️', cls: 'email' },
  note: { glyph: '📝', cls: 'note' },
  meeting: { glyph: '🤝', cls: 'meeting' },
  task: { glyph: '✅', cls: 'task' },
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function dayBucket(iso: string | null): string {
  if (!iso) return 'Earlier'
  const d = new Date(iso)
  const now = new Date()
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (d >= midnight) return 'Today'
  const yesterday = new Date(midnight.getTime() - 86400000)
  if (d >= yesterday) return 'Yesterday'
  if (d >= new Date(midnight.getTime() - 6 * 86400000)) return 'This week'
  return 'Earlier'
}

function feedLink(it: FeedItem): string | null {
  if (it.deal_id) return `/deals/${it.deal_id}`
  // /buyer-opportunities, not /buyers. This was the SECOND live instance of the
  // bug that broke the KPI cards: a path this app never declares, so the
  // catch-all sent the click to "/" and the landing route bounced it to the
  // user's dashboard. It looked like "the feed link goes back to My Day".
  // A guard test in the backend suite now walks every in-app path in this
  // repo against App.tsx's route table, so a third one cannot ship quietly.
  if (it.buyer_opportunity_id) return `/buyer-opportunities/${it.buyer_opportunity_id}`
  if (it.contact_id) return `/contacts/${it.contact_id}`
  if (it.unit_id) return `/units/${it.unit_id}`
  return null
}

// ── Grouping (MYDAY_POLISH, 2026-08-04) ────────────────────────────────────
// The feed sections by KIND — Calls, Emails, Notes, Meetings, Tasks — with a
// count on each header and newest first inside. That is Clint's ask, and it is
// the reading a rep scanning their own day wants: "what did I do" as blocks of
// one thing, not a strict chronology they have to unpick.
//
// BOTH GROUPINGS COEXIST, which the spec asked for if it was cheap: inside a
// kind section the day dividers stay, so "Calls (12)" still reads Today /
// Yesterday / This week / Earlier down its length. Relative times are
// untouched. Nothing is re-sorted to do it — the server already returns
// newest-first, and a stable bucketing of an ordered list stays ordered.
//
// The plural label is a lookup, not an appended 's': "Notes" is fine but
// "Meetings" from "meeting" and "Activities" from "activity" are not the same
// rule, and a feed that says "Meetinges" is a feed nobody trusts.
const KIND_SECTION: Record<string, string> = {
  call: 'Calls', email: 'Emails', note: 'Notes', meeting: 'Meetings',
  task: 'Tasks',
}

// The order sections appear in. Fixed rather than by-count, so the feed does
// not rearrange itself under a rep as the day goes on. Anything not named here
// keeps its own kind as a label and sorts to the end.
const KIND_ORDER = ['call', 'email', 'meeting', 'note', 'task']

function sectionOf(it: FeedItem, group: FeedGroup): string {
  return group === 'kind'
    ? (KIND_SECTION[it.kind] ?? it.kind)
    : dayBucket(it.occurred_at)
}

function sectionRank(it: FeedItem, group: FeedGroup): number {
  if (group !== 'kind') return 0            // day order is the list's own order
  const i = KIND_ORDER.indexOf(it.kind)
  return i === -1 ? KIND_ORDER.length : i
}

interface Section { title: string; items: FeedItem[] }

/** Bucket an ALREADY newest-first list into sections without re-sorting the
 *  items. Exported for the same reason stageSubtitle is: the arithmetic is the
 *  part worth being able to reason about on its own. */
export function feedSections(items: FeedItem[], group: FeedGroup): Section[] {
  const byTitle = new Map<string, Section>()
  const rank = new Map<string, number>()
  for (const it of items) {
    const title = sectionOf(it, group)
    if (!byTitle.has(title)) {
      byTitle.set(title, { title, items: [] })
      rank.set(title, sectionRank(it, group))
    }
    byTitle.get(title)!.items.push(it)
  }
  const out = [...byTitle.values()]
  if (group !== 'kind') return out          // day sections are already in order
  return out.sort((a, b) => (rank.get(a.title)! - rank.get(b.title)!))
}

function FeedRow({ it, delay }: { it: FeedItem; delay: number }) {
  const meta = KIND_META[it.kind] ?? { glyph: '•', cls: 'other' }
  const to = feedLink(it)
  const body = (
    <>
      <span className={`feed-ic fk-${meta.cls}`} aria-hidden>{meta.glyph}</span>
      <span className="feed-subject">
        {it.subject || it.kind}
        {it.call_outcome ? <span className="feed-outcome"> · {it.call_outcome}</span> : null}
      </span>
      <span className="feed-when">{ago(it.occurred_at)}</span>
    </>
  )
  return (
    <div className="feed-block" style={{ animationDelay: `${Math.min(delay, 12) * 35}ms` }}>
      {to
        ? <Link to={to} className="feed-item">{body}</Link>
        : <div className="feed-item">{body}</div>}
    </div>
  )
}

export function ActivityFeed({ data }: { data: ActivityFeedResult }) {
  if (!data.items.length) {
    return (
      <div className="note" style={{ padding: '14px 16px' }}>
        Nothing logged yet today. The first call you log starts the story.
      </div>
    )
  }
  const group: FeedGroup = data.group ?? 'kind'
  const sections = feedSections(data.items, group)
  let seen = 0
  return (
    <div className="feed-list">
      {sections.map((sec) => {
        // Day dividers live INSIDE a kind section; in day mode the section
        // header already is the day, so a second one would repeat it.
        let lastDay = ''
        return (
          <div key={sec.title} className="feed-sect">
            <div className="feed-sect-head">
              {sec.title}
              <span className="feed-sect-count">{sec.items.length}</span>
            </div>
            {sec.items.map((it) => {
              const day = dayBucket(it.occurred_at)
              const showDay = group === 'kind' && day !== lastDay
              lastDay = day
              return (
                <div key={it.id}>
                  {showDay && <div className="feed-day">{day}</div>}
                  <FeedRow it={it} delay={seen++} />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
