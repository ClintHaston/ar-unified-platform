import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type InboundLead, type InboundLeadsResponse } from '../lib/api'

// Lead approvals (build step 4b): the §5 inbound door's human half. The
// 15-minute poller lands newly created HubSpot contacts here; approval
// births the contact in Postgres with source='form_import' and its
// hubspot_id mapped at birth (it can never be pushed back as a
// duplicate); dismiss records the decision — the UNIQUE hubspot id
// means a lead enters the door once, ever.

type Tab = 'pending_approval' | 'approved' | 'dismissed'

const TABS: Array<{ key: Tab; label: string; countKey: keyof InboundLeadsResponse['counts'] }> = [
  { key: 'pending_approval', label: 'Awaiting decision', countKey: 'pending' },
  { key: 'approved', label: 'Approved', countKey: 'approved' },
  { key: 'dismissed', label: 'Dismissed', countKey: 'dismissed' },
]

function when(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function LeadApprovals() {
  const [tab, setTab] = useState<Tab>('pending_approval')
  const [data, setData] = useState<InboundLeadsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [lastApproved, setLastApproved] = useState<{ leadName: string; contactId: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.inboundLeads(tab)
      .then((res) => { setData(res); setError('') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load leads'))
      .finally(() => setLoading(false))
  }, [tab])

  useEffect(() => { load() }, [load])

  async function act(lead: InboundLead, action: 'approve' | 'dismiss') {
    setBusy(lead.id)
    setError('')
    try {
      if (action === 'approve') {
        const res = await api.approveInboundLead(lead.id)
        setLastApproved({ leadName: lead.name ?? lead.email ?? 'contact', contactId: res.contact_id })
      } else {
        await api.dismissInboundLead(lead.id)
        setLastApproved(null)
      }
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  if (loading && !data) return <div className="admin-loading">Loading lead queue…</div>

  return (
    <div>
      <div className="note" style={{ marginBottom: 12 }}>
        New HubSpot contacts (created after the backfill snapshot) land here every 15 minutes —
        read-only against HubSpot. Approving births the contact in the platform with its HubSpot
        id already mapped; dismissing keeps it out. Each HubSpot contact passes through once.
      </div>

      {lastApproved && (
        <div className="panel" style={{ borderLeft: '4px solid #2e7d5b' }} data-testid="approved-banner">
          Approved — <b>{lastApproved.leadName}</b> is now a platform contact
          (source <code>form_import</code>, HubSpot id mapped at birth).{' '}
          <Link to={`/contacts/${lastApproved.contactId}`}>Open contact</Link>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className="btn-primary"
            style={tab === t.key ? undefined : { background: 'transparent', color: 'var(--p-navy-mid)', border: '1px solid var(--p-navy-mid)' }}
            onClick={() => setTab(t.key)}
          >
            {t.label} ({data?.counts[t.countKey] ?? 0})
          </button>
        ))}
      </div>

      {error && <div className="note" style={{ color: '#B4432B', marginBottom: 8 }}>{error}</div>}

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="plat-table">
          <thead>
            <tr>
              <th>Lead</th><th>Email</th><th>Phone</th><th>HubSpot lifecycle</th>
              <th>{tab === 'pending_approval' ? 'Arrived' : 'Decided'}</th>
              {tab !== 'pending_approval' && <th>By</th>}
              {tab === 'pending_approval' && <th style={{ width: 200 }}></th>}
            </tr>
          </thead>
          <tbody>
            {(data?.leads ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--p-body)', padding: 18 }}>
                  {tab === 'pending_approval'
                    ? 'No leads awaiting a decision — the door is clear.'
                    : 'Nothing here yet.'}
                </td>
              </tr>
            ) : (
              (data?.leads ?? []).map((lead) => (
                <tr key={lead.id}>
                  <td><b>{lead.name ?? '(no name)'}</b></td>
                  <td>{lead.email ?? '—'}</td>
                  <td>{lead.phone ?? '—'}</td>
                  <td>{lead.lifecyclestage ?? '—'}</td>
                  <td className="note">
                    {when(tab === 'pending_approval' ? lead.imported_at : lead.resolved_at)}
                  </td>
                  {tab !== 'pending_approval' && <td>{lead.resolved_by_name ?? '—'}</td>}
                  {tab === 'pending_approval' && (
                    <td>
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="btn-primary" disabled={busy === lead.id}
                                onClick={() => act(lead, 'approve')}>
                          {busy === lead.id ? '…' : 'Approve'}
                        </button>
                        <button className="btn-primary" disabled={busy === lead.id}
                                style={{ background: '#8a8f98' }}
                                onClick={() => act(lead, 'dismiss')}>
                          Dismiss
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
