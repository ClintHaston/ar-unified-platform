import { useEffect, useMemo, useState } from 'react'
import { api, type ContactHit, type OwnerOption, type Pipeline } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

// Platform-native "New deal" capture (P0). Sell-side only — the pipeline
// picker excludes buy-side (buyer opportunities own that). Everything here is
// Postgres-local: on save the 4a trigger enqueues a disarmed outbox row; no
// HubSpot write happens. Contact typeahead reuses the 3c-5 search endpoint;
// company auto-derives from the contact server-side; owner defaults to the
// creating rep and only an admin may reassign.

interface NewDealFormProps {
  onCreated: (dealId: string) => void
  onCancel: () => void
}

export function NewDealForm({ onCreated, onCancel }: NewDealFormProps) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [pipelineId, setPipelineId] = useState('')
  const [stageId, setStageId] = useState('')
  const [name, setName] = useState('')

  const [q, setQ] = useState('')
  const [hits, setHits] = useState<ContactHit[]>([])
  const [contact, setContact] = useState<ContactHit | null>(null)

  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [ownerId, setOwnerId] = useState('')  // '' = self (default)
  const [value, setValue] = useState('')
  const [commission, setCommission] = useState('')
  const [expectedClose, setExpectedClose] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.pipelines()
      .then((res) => {
        const sell = res.pipelines.filter((p) => p.kind !== 'buy')
        setPipelines(sell)
        if (sell.length > 0) {
          setPipelineId(sell[0].id)
          if (sell[0].stages.length > 0) setStageId(sell[0].stages[0].id)
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load pipelines'))
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    api.contactOwners().then((res) => setOwners(res.owners.filter((o) => o.is_active))).catch(() => setOwners([]))
  }, [isAdmin])

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return }
    let live = true
    api.searchContacts(q.trim())
      .then((res) => { if (live) setHits(res.contacts) })
      .catch(() => { if (live) setHits([]) })
    return () => { live = false }
  }, [q])

  const activePipeline = useMemo(
    () => pipelines.find((p) => p.id === pipelineId),
    [pipelines, pipelineId],
  )

  function onPipelineChange(id: string) {
    setPipelineId(id)
    const p = pipelines.find((pp) => pp.id === id)
    setStageId(p && p.stages.length > 0 ? p.stages[0].id : '')
  }

  async function save() {
    if (!pipelineId || !stageId || !name.trim()) return
    setSaving(true)
    setError('')
    try {
      const dollars = value.trim() === '' ? null : Math.round(parseFloat(value) * 100)
      const pct = commission.trim() === '' ? null : parseFloat(commission)
      const res = await api.createDeal({
        pipeline_id: pipelineId,
        stage_id: stageId,
        name: name.trim(),
        contact_id: contact?.id ?? null,
        owner_id: isAdmin && ownerId ? ownerId : null,
        value_cents: dollars !== null && !Number.isNaN(dollars) ? dollars : null,
        commission_pct: pct !== null && !Number.isNaN(pct) ? pct : null,
        expected_close: expectedClose || null,
      })
      onCreated(res.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deal')
      setSaving(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--p-steel)', borderRadius: 8, padding: '14px 16px', marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--p-navy-dark)', marginBottom: 10 }}>
        New deal
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ flex: '1 1 220px', fontSize: 12, color: 'var(--p-body)' }}>
          Pipeline
          <select className="plat-input" value={pipelineId} onChange={(e) => onPipelineChange(e.target.value)}>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label style={{ flex: '1 1 220px', fontSize: 12, color: 'var(--p-body)' }}>
          Stage
          <select className="plat-input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {(activePipeline?.stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>

      <label style={{ fontSize: 12, color: 'var(--p-body)' }}>
        Deal name
        <input
          className="plat-input"
          placeholder="e.g. 2018 Cat 336 excavator — listing"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div style={{ fontSize: 12, color: 'var(--p-body)', marginTop: 4 }}>Contact (optional)</div>
      {contact ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="pill gold">{contact.name ?? 'Contact'}</span>
          {contact.company_name && <span style={{ fontSize: 12, color: 'var(--p-body)' }}>{contact.company_name}</span>}
          <button className="plat-btn ghost" onClick={() => { setContact(null); setQ('') }}>Change</button>
        </div>
      ) : (
        <>
          <input
            className="plat-input"
            placeholder="Search a contact by name / email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {hits.length > 0 && (
            <div style={{ border: '1px solid var(--p-steel)', borderRadius: 6, marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
              {hits.map((h) => (
                <div
                  key={h.id}
                  onClick={() => { setContact(h); setHits([]) }}
                  style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--p-row)' }}
                >
                  <b>{h.name ?? 'Unnamed'}</b>
                  {h.company_name ? ` · ${h.company_name}` : ''}
                  {h.email ? <span style={{ color: 'var(--p-body)' }}> · {h.email}</span> : null}
                </div>
              ))}
            </div>
          )}
          <div className="note" style={{ marginTop: 4 }}>Company auto-derives from the chosen contact.</div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        <label style={{ flex: '1 1 140px', fontSize: 12, color: 'var(--p-body)' }}>
          Value ($)
          <input className="plat-input" type="number" min="0" step="1" placeholder="0"
                 value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label style={{ flex: '1 1 120px', fontSize: 12, color: 'var(--p-body)' }}>
          Commission (%)
          <input className="plat-input" type="number" min="0" max="100" step="0.1" placeholder="optional"
                 value={commission} onChange={(e) => setCommission(e.target.value)} />
        </label>
        <label style={{ flex: '1 1 160px', fontSize: 12, color: 'var(--p-body)' }}>
          Expected close
          <input className="plat-input" type="date"
                 value={expectedClose} onChange={(e) => setExpectedClose(e.target.value)} />
        </label>
      </div>

      {isAdmin && (
        <label style={{ fontSize: 12, color: 'var(--p-body)' }}>
          Owner
          <select className="plat-input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Me ({user?.name})</option>
            {owners.filter((o) => o.id !== user?.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}

      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}

      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <button className="plat-btn" disabled={saving || !name.trim() || !stageId} onClick={save}>
          {saving ? 'Creating…' : 'Create deal'}
        </button>
        <button className="plat-btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  )
}
