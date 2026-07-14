import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type OwnerOption, type SegmentCriteria, type SegmentListItem, type SegmentObjectType, type SegmentSource, type SegmentType } from '../lib/api'
import { SegmentCriteriaBuilder } from '../components/SegmentCriteriaBuilder'

// Lists (Segments) — HubSpot-style saved lists of contacts or companies.
// Active lists compute membership live from criteria; static lists snapshot a
// frozen set. gold-sell / teal-buy palette via --p-*.

const EMPTY_CRITERIA: SegmentCriteria = { groups: [] }

export function Lists() {
  const navigate = useNavigate()
  const [segments, setSegments] = useState<SegmentListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [sources, setSources] = useState<SegmentSource[]>([])
  const [owners, setOwners] = useState<OwnerOption[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [objectType, setObjectType] = useState<SegmentObjectType>('contact')
  const [criteria, setCriteria] = useState<SegmentCriteria>(EMPTY_CRITERIA)
  const [segType, setSegType] = useState<SegmentType>('active')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const source = useMemo(() => sources.find((s) => s.object_type === objectType), [sources, objectType])

  function load() {
    setLoading(true)
    api.listSegments()
      .then((r) => { setSegments(r.segments); setError('') })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load lists'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    api.segmentRegistry().then((r) => setSources(r.sources)).catch(() => setSources([]))
    api.contactOwners().then((r) => setOwners(r.owners)).catch(() => setOwners([]))
  }, [])

  function resetCreate() {
    setObjectType('contact'); setCriteria(EMPTY_CRITERIA); setSegType('active')
    setName(''); setDescription(''); setShowCreate(false)
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const created = await api.createSegment({
        name: name.trim(),
        description: description.trim() || null,
        object_type: objectType,
        type: segType,
        criteria,
      })
      resetCreate()
      navigate(`/lists/${created.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create list')
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ margin: 0 }}>Lists</h3>
        <span className="note">Saved segments of contacts and companies.</span>
        <button className="plat-btn" style={{ marginLeft: 'auto' }} onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : '+ New list'}
        </button>
      </div>

      {showCreate && source && (
        <div className="panel">
          <h3>New list</h3>
          <label className="rb-lbl">Object</label>
          <div className="roletoggle">
            <button className={objectType === 'contact' ? 'active' : ''} onClick={() => { setObjectType('contact'); setCriteria(EMPTY_CRITERIA) }}>Contacts</button>
            <button className={objectType === 'company' ? 'active' : ''} onClick={() => { setObjectType('company'); setCriteria(EMPTY_CRITERIA) }}>Companies</button>
          </div>

          <label className="rb-lbl">Criteria</label>
          <SegmentCriteriaBuilder source={source} criteria={criteria} onChange={setCriteria}
                                  owners={owners} accent="var(--p-gold)" />

          <label className="rb-lbl" style={{ marginTop: 12 }}>List type</label>
          <div className="seg-type-choices">
            <label className={`seg-type-card${segType === 'active' ? ' on' : ''}`}>
              <input type="radio" name="segtype" checked={segType === 'active'} onChange={() => setSegType('active')} />
              <div>
                <b>Active</b>
                <div className="note">Membership updates automatically as records match or stop matching the criteria.</div>
              </div>
            </label>
            <label className={`seg-type-card${segType === 'static' ? ' on' : ''}`}>
              <input type="radio" name="segtype" checked={segType === 'static'} onChange={() => setSegType('static')} />
              <div>
                <b>Static</b>
                <div className="note">A frozen snapshot of who matches right now. Members are added or removed by hand.</div>
              </div>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <input className="plat-input" style={{ marginBottom: 0, flex: 1, minWidth: 200 }} placeholder="List name…" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="plat-input" style={{ marginBottom: 0, flex: 2, minWidth: 200 }} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <button className="plat-btn" disabled={saving || !name.trim()} onClick={save}>{saving ? 'Creating…' : 'Create list'}</button>
          </div>
        </div>
      )}

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="plat-table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Object</th><th>Members</th><th>Owner</th></tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.id} className="row-link" onClick={() => navigate(`/lists/${s.id}`)}>
                  <td>
                    <b>{s.name}</b>
                    {s.description && <div className="note" style={{ marginTop: 2 }}>{s.description}</div>}
                  </td>
                  <td><span className={`pill ${s.type === 'active' ? 'buy' : 'gold'}`}>{s.type === 'active' ? 'Active' : 'Static'}</span></td>
                  <td style={{ textTransform: 'capitalize' }}>{s.object_type}</td>
                  <td className="num">{s.count.toLocaleString()}</td>
                  <td>{s.owner_name ?? '—'}</td>
                </tr>
              ))}
              {!loading && segments.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--p-body)' }}>No lists yet — create one to segment your contacts or companies.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
    </div>
  )
}
