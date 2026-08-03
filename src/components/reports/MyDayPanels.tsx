// MyDayPanels — the rep-dashboard experience layer (v2, 2026-08-02 evening).
// v1 was accurate and dead. v2 answers the two questions a morning screen is
// for: "how am I doing?" (trend deltas vs the previous window, count-up
// numbers, win/loss context) and "what do I touch next?" (every card is a
// door, urgency states light up, the feed reads like a story of the day).
// All motion sits behind prefers-reduced-motion. Site design system only.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import type { MyKpis, ActivityFeedResult, FeedItem } from '../../lib/api'

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

function Card({ to, accent, urgent, children }: {
  to: string; accent?: 'gold' | 'teal' | 'warn'; urgent?: boolean
  children: React.ReactNode
}) {
  return (
    <Link to={to} className={`kpi-card${accent ? ` ac-${accent}` : ''}${urgent ? ' urgent' : ''}`}>
      {children}
    </Link>
  )
}

function Value({ children }: { children: React.ReactNode }) {
  return <div className="kpi-value">{children}</div>
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="kpi-label">{children}</div>
}

export function KpiRow({ data }: { data: MyKpis }) {
  const win = data.window_days
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
        <Card to="/deals" accent="gold">
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
        <Card to="/deals" accent="gold">
          <Value>{money(weightC)}</Value>
          <Lbl>Weighted pipeline</Lbl>
          <span className="kpi-delta flat">expected value at stage odds</span>
        </Card>
        <Card to="/reports?tab=deals" accent="teal">
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
        <Card to="/reports?tab=deals" accent="teal">
          <Value>
            {data.avg_days_to_close === null
              ? <span className="kpi-empty">waiting on wins</span>
              : data.avg_days_to_close.toFixed(0)}
          </Value>
          <Lbl>Avg days to close</Lbl>
          <span className="kpi-delta flat">{closes ? `${closes} closes this window` : 'closes will fill this in'}</span>
        </Card>
        <Card to="/reports?tab=calls">
          <Value>{calls}</Value>
          <Lbl>Calls</Lbl>
          <Delta now={data.calls} prev={data.calls_prev} label={prior} />
        </Card>
        <Card to="/contacts">
          <Value>{emails}</Value>
          <Lbl>Emails</Lbl>
          <Delta now={data.emails} prev={data.emails_prev} label={prior} />
        </Card>
        <Card to="/deals" urgent={data.tasks_due_today > 0}>
          <Value>{data.tasks_due_today}</Value>
          <Lbl>Tasks due today</Lbl>
          <span className="kpi-delta flat">
            {data.tasks_due_today > 0 ? 'knock these out first' : 'all clear'}
          </span>
        </Card>
        <Card to="/deals" accent={data.stale_deals > 0 ? 'warn' : undefined}>
          <Value>{data.stale_deals.toLocaleString()}</Value>
          <Lbl>Stale deals</Lbl>
          <span className="kpi-delta flat">
            {data.stale_deals > 0 ? 'no movement in a while — pick three' : 'nothing gathering dust'}
          </span>
        </Card>
        <div className="kpi-window">last {win} days</div>
      </div>
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
  if (it.buyer_opportunity_id) return `/buyers/${it.buyer_opportunity_id}`
  if (it.contact_id) return `/contacts/${it.contact_id}`
  if (it.unit_id) return `/units/${it.unit_id}`
  return null
}

export function ActivityFeed({ data }: { data: ActivityFeedResult }) {
  if (!data.items.length) {
    return (
      <div className="note" style={{ padding: '14px 16px' }}>
        Nothing logged yet today. The first call you log starts the story.
      </div>
    )
  }
  let lastBucket = ''
  return (
    <div className="feed-list">
      {data.items.map((it, idx) => {
        const bucket = dayBucket(it.occurred_at)
        const showHead = bucket !== lastBucket
        lastBucket = bucket
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
          <div key={it.id} className="feed-block" style={{ animationDelay: `${Math.min(idx, 12) * 35}ms` }}>
            {showHead && <div className="feed-day">{bucket}</div>}
            {to
              ? <Link to={to} className="feed-item">{body}</Link>
              : <div className="feed-item">{body}</div>}
          </div>
        )
      })}
    </div>
  )
}
