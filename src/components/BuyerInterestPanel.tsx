import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type InterestStatus, type UnitBuyerInterest } from '../lib/api'

// The point of build step 4e: cross-rep "who's working this unit". Read-only
// for everyone — a rep about to sell a unit sees every open buyer opportunity
// interested in it (which rep, which buyer, their notes and interest status)
// before selling it out from under another rep's buyer. Self-fetching, id-only
// panel (mirrors DocumentsPanel), so UnitDetail just drops it in.

const INTEREST_LABEL: Record<InterestStatus, string> = {
  info_sent: 'Info sent',
  negotiating: 'Negotiating',
  cooling: 'Cooling',
  offer_made: 'Offer made',
}
const INTEREST_PILL: Record<InterestStatus, string> = {
  info_sent: 'buy',
  negotiating: 'gold',
  cooling: 'grey',
  offer_made: 'green',
}

function money(cents: number | null): string {
  if (cents === null) return '—'
  const dollars = cents / 100
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}K`
  return `$${Math.round(dollars)}`
}

interface BuyerInterestPanelProps {
  unitId: string
}

export function BuyerInterestPanel({ unitId }: BuyerInterestPanelProps) {
  const [interest, setInterest] = useState<UnitBuyerInterest[] | null>(null)
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    api.unitBuyerInterest(unitId)
      .then((res) => { if (live) { setInterest(res.interest); setWebsiteUrl(res.unit_website_url) } })
      .catch((err: unknown) => { if (live) setError(err instanceof Error ? err.message : 'Failed to load') })
    return () => { live = false }
  }, [unitId])

  return (
    <div className="panel">
      <h3>
        Buy opps
        {interest && interest.length > 0 && <span className="c">{interest.length}</span>}
      </h3>
      <div className="note" style={{ marginTop: 0 }}>
        Open buy opps working this unit, across all reps — read-only.
        {websiteUrl ? (
          <> · <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--p-gold)', fontWeight: 'bold' }}>View live listing ↗</a></>
        ) : (
          <> · <span>Not listed on the website yet</span></>
        )}
      </div>
      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      {interest === null ? (
        <div className="note">Loading…</div>
      ) : interest.length === 0 ? (
        <div className="note">No open buy opps are tracking this unit.</div>
      ) : (
        interest.map((row) => (
          <div className="hist-item" key={row.opportunity_id} style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div>
                <b>{row.buyer_name ?? 'Buyer'}</b>
                {row.buyer_company ? <span style={{ color: 'var(--p-body)' }}> · {row.buyer_company}</span> : null}
                <span className={`pill ${INTEREST_PILL[row.interest_status]}`} style={{ marginLeft: 8 }}>
                  {INTEREST_LABEL[row.interest_status]}
                </span>
                {row.has_offer && <span className="pill green" style={{ marginLeft: 6 }}>Offer</span>}
              </div>
              <div className="when">
                Rep {row.owner_name ?? '—'}
                {row.is_mine ? ' (you)' : ''} · stage {row.stage_name}
                {row.target_price_cents !== null ? ` · target ${money(row.target_price_cents)}` : ''}
                {' · '}
                <Link to={`/buyer-opportunities/${row.opportunity_id}`} style={{ color: 'var(--p-gold)' }}>open →</Link>
              </div>
              {(row.note || row.opp_notes) && (
                <div className="when" style={{ marginTop: 2 }}>{row.note || row.opp_notes}</div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
