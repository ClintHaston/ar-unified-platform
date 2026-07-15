import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  api, type ConsignerOption, type IntakeExpenseInput, type InspectionItemInput,
  type TaxonomyLists,
} from '../lib/api'

// Intake wizard (build step 3c-8, Decision 4, right-sized): a guided
// create-unit flow — no new unit states, no workflow objects. The
// inspection checklist becomes an ordinary §3 inspection document,
// rendered and hashed server-side. A unit is never born reserved or sold.

const STEPS = ['Consigner', 'Unit', 'Condition', 'Expenses', 'Inspection', 'Review'] as const

const EXPENSE_CATEGORIES = ['transport', 'repair', 'inspection', 'storage', 'other']

const CHECKLIST_ITEMS = [
  'Engine & fluids',
  'Hydraulics',
  'Transmission / drivetrain',
  'Undercarriage / tires',
  'Electrical & gauges',
  'Cab & controls',
  'Attachments',
  'Leak check',
  'Serial number verified',
  'Hour meter verified',
]

type ConsignerMode = 'none' | 'existing' | 'new'

interface ExpenseDraft {
  category: string
  amount: string
  incurred_on: string
  note: string
}

export function IntakeWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [taxonomy, setTaxonomy] = useState<TaxonomyLists | null>(null)
  const [consigners, setConsigners] = useState<ConsignerOption[]>([])
  const [storageOk, setStorageOk] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [createdUnitId, setCreatedUnitId] = useState('')

  // step 1 — consigner
  const [consignerMode, setConsignerMode] = useState<ConsignerMode>('none')
  const [consignerId, setConsignerId] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [splitPct, setSplitPct] = useState('')
  const [splitTerms, setSplitTerms] = useState('')

  // step 2 — unit & taxonomy
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [makeId, setMakeId] = useState('')
  const [modelId, setModelId] = useState('')
  const [year, setYear] = useState('')
  const [serial, setSerial] = useState('')

  // step 3 — condition & money
  const [hours, setHours] = useState('')
  const [condition, setCondition] = useState('')
  const [location, setLocation] = useState('')
  const [asking, setAsking] = useState('')
  const [stockCost, setStockCost] = useState('')
  const [description, setDescription] = useState('')

  // step 4 — intake expenses
  const [expenses, setExpenses] = useState<ExpenseDraft[]>([])

  // step 5 — inspection
  const [inspectionOn, setInspectionOn] = useState(true)
  const [items, setItems] = useState<InspectionItemInput[]>(
    CHECKLIST_ITEMS.map((label) => ({ label, result: 'pass' as const }))
  )
  const [inspectionNotes, setInspectionNotes] = useState('')

  // step 6 — review
  const [initialStatus, setInitialStatus] = useState<'available' | 'under_maintenance'>('available')

  useEffect(() => {
    Promise.all([api.taxonomy(), api.consigners(), api.documentsStatus()])
      .then(([t, c, s]) => {
        setTaxonomy(t)
        setConsigners(c.consigners)
        setStorageOk(s.configured)
        if (!s.configured) setInspectionOn(false)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
  }, [])

  const models = useMemo(() => {
    if (!taxonomy) return []
    return taxonomy.models.filter((m) =>
      (!makeId || m.make_id === makeId) && (!categoryId || m.category_id === categoryId))
  }, [taxonomy, makeId, categoryId])

  function stepValid(): string | null {
    if (step === 0) {
      if (consignerMode === 'existing' && !consignerId) return 'Pick a consigner or choose another option'
      if (consignerMode === 'new' && !newCompany.trim()) return 'Enter the consigner company name'
    }
    if (step === 1 && !title.trim()) return 'Title is required'
    if (step === 3) {
      for (const e of expenses) {
        if (!(parseFloat(e.amount) > 0)) return 'Every expense needs a positive amount'
        if (!e.incurred_on) return 'Every expense needs a date'
      }
    }
    return null
  }

  function next() {
    const problem = stepValid()
    if (problem) { setError(problem); return }
    setError('')
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  async function submit() {
    setSaving(true)
    setError('')
    try {
      const result = await api.intakeUnit({
        unit: {
          title: title.trim(),
          category_id: categoryId || null,
          make_id: makeId || null,
          model_id: modelId || null,
          year: year ? parseInt(year, 10) : null,
          serial: serial.trim() || null,
          hours: hours ? parseFloat(hours) : null,
          condition: condition.trim() || null,
          description: description.trim() || null,
          location: location.trim() || null,
          asking_price_cents: asking ? Math.round(parseFloat(asking) * 100) : null,
          stock_cost_cents: stockCost ? Math.round(parseFloat(stockCost) * 100) : null,
        },
        initial_status: initialStatus,
        consigner:
          consignerMode === 'existing' ? { consigner_id: consignerId }
          : consignerMode === 'new' ? {
              new_company_name: newCompany.trim(),
              split_pct: splitPct ? parseFloat(splitPct) : undefined,
              split_terms: splitTerms.trim() || undefined,
            }
          : null,
        expenses: expenses.map((e): IntakeExpenseInput => ({
          category: e.category,
          amount_cents: Math.round(parseFloat(e.amount) * 100),
          incurred_on: e.incurred_on,
          note: e.note.trim() || undefined,
        })),
        inspection: inspectionOn
          ? { items, notes: inspectionNotes.trim() || undefined }
          : null,
      })
      setCreatedUnitId(result.unit_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Intake failed')
    } finally {
      setSaving(false)
    }
  }

  if (createdUnitId) {
    return (
      <div className="panel" style={{ maxWidth: 560 }}>
        <h3>Unit created</h3>
        <p style={{ fontSize: 13, margin: '10px 0 16px' }}>
          <b>{title}</b> is in inventory as <b>{initialStatus === 'available' ? 'Available' : 'In maintenance'}</b>
          {inspectionOn ? ', with the inspection checklist saved as a hashed document' : ''}.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="plat-btn" onClick={() => navigate(`/units/${createdUnitId}`)}>
            Open unit → run valuation
          </button>
          <button className="plat-btn ghost" onClick={() => navigate('/inventory')}>
            Back to inventory
          </button>
        </div>
        <div className="note">
          Pricing from a real number beats guessing. The Valuation panel on the unit runs
          the Evaluator and saves an immutable snapshot.
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Link to="/inventory" className="back-link">← Back to inventory</Link>

      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <span key={s} className={`wizard-step${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      <div className="panel">
        {step === 0 && (
          <>
            <h3>Consigner</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <label><input type="radio" checked={consignerMode === 'none'} onChange={() => setConsignerMode('none')} /> No consigner: owned / purchased unit</label>
              <label><input type="radio" checked={consignerMode === 'existing'} onChange={() => setConsignerMode('existing')} /> Existing consigner</label>
              {consignerMode === 'existing' && (
                <select className="plat-input" value={consignerId} onChange={(e) => setConsignerId(e.target.value)}>
                  <option value="">Choose…</option>
                  {consigners.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}{c.split_pct !== null ? ` · ${c.split_pct}%` : ''}
                    </option>
                  ))}
                </select>
              )}
              <label><input type="radio" checked={consignerMode === 'new'} onChange={() => setConsignerMode('new')} /> New consigner</label>
              {consignerMode === 'new' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="plat-input" style={{ flex: 2, minWidth: 200 }} placeholder="Company name" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} />
                  <input className="plat-input" style={{ maxWidth: 110 }} type="number" step="0.1" placeholder="Split %" value={splitPct} onChange={(e) => setSplitPct(e.target.value)} />
                  <input className="plat-input" style={{ flex: 1, minWidth: 160 }} placeholder="Split terms (optional)" value={splitTerms} onChange={(e) => setSplitTerms(e.target.value)} />
                </div>
              )}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h3>Unit & taxonomy</h3>
            <input className="plat-input" placeholder="Title (e.g. 2019 Cat 745 Articulated Truck) *" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select className="plat-input" style={{ flex: 1, minWidth: 170 }} value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setModelId('') }}>
                <option value="">Category…</option>
                {taxonomy?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="plat-input" style={{ flex: 1, minWidth: 150 }} value={makeId} onChange={(e) => { setMakeId(e.target.value); setModelId('') }}>
                <option value="">Make…</option>
                {taxonomy?.makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select className="plat-input" style={{ flex: 1, minWidth: 150 }} value={modelId} onChange={(e) => setModelId(e.target.value)}>
                <option value="">Model…</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="plat-input" style={{ maxWidth: 120 }} type="number" placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)} />
              <input className="plat-input" style={{ flex: 1 }} placeholder="Serial / VIN" value={serial} onChange={(e) => setSerial(e.target.value)} />
            </div>
            <div className="note">Taxonomy links feed valuation and search. Set them now if known; they stay editable on the unit.</div>
          </>
        )}

        {step === 2 && (
          <>
            <h3>Condition & pricing</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="plat-input" style={{ maxWidth: 130 }} type="number" placeholder="Hours" value={hours} onChange={(e) => setHours(e.target.value)} />
              <input className="plat-input" style={{ flex: 1, minWidth: 130 }} placeholder="Condition" list="cond-options" value={condition} onChange={(e) => setCondition(e.target.value)} />
              <datalist id="cond-options">
                {['excellent', 'good', 'fair', 'poor'].map((c) => <option key={c} value={c} />)}
              </datalist>
              <input className="plat-input" style={{ flex: 1, minWidth: 160 }} placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="plat-input" type="number" step="0.01" placeholder="Asking price ($)" value={asking} onChange={(e) => setAsking(e.target.value)} />
              <input className="plat-input" type="number" step="0.01" placeholder="Stock cost ($)" value={stockCost} onChange={(e) => setStockCost(e.target.value)} />
            </div>
            <textarea className="plat-input" rows={3} placeholder="Description…" value={description} onChange={(e) => setDescription(e.target.value)} />
          </>
        )}

        {step === 3 && (
          <>
            <h3>Intake expenses</h3>
            {expenses.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <select className="plat-input" style={{ marginBottom: 0, maxWidth: 130 }} value={e.category} onChange={(ev) => setExpenses(expenses.map((x, j) => j === i ? { ...x, category: ev.target.value } : x))}>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="plat-input" style={{ marginBottom: 0, maxWidth: 110 }} type="number" step="0.01" placeholder="$" value={e.amount} onChange={(ev) => setExpenses(expenses.map((x, j) => j === i ? { ...x, amount: ev.target.value } : x))} />
                <input className="plat-input" style={{ marginBottom: 0, maxWidth: 150 }} type="date" value={e.incurred_on} onChange={(ev) => setExpenses(expenses.map((x, j) => j === i ? { ...x, incurred_on: ev.target.value } : x))} />
                <input className="plat-input" style={{ marginBottom: 0, flex: 1, minWidth: 120 }} placeholder="Note" value={e.note} onChange={(ev) => setExpenses(expenses.map((x, j) => j === i ? { ...x, note: ev.target.value } : x))} />
                <button className="plat-btn ghost" onClick={() => setExpenses(expenses.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button
              className="plat-btn ghost"
              onClick={() => setExpenses([...expenses, { category: 'transport', amount: '', incurred_on: new Date().toISOString().slice(0, 10), note: '' }])}
            >
              + Add expense
            </button>
            <div className="note">Transport, inspection, repairs at intake. Margin math reads these later; no approvals, no workflow.</div>
          </>
        )}

        {step === 4 && (
          <>
            <h3>Inspection checklist</h3>
            {!storageOk ? (
              <div className="note">
                Document storage is pending (R2 setup). The checklist can't be saved as a
                document yet, so this step is skipped. The unit can be inspected later.
              </div>
            ) : (
              <>
                <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                  <input type="checkbox" checked={inspectionOn} onChange={(e) => setInspectionOn(e.target.checked)} />
                  Record an intake inspection (saved as a hashed inspection document)
                </label>
                {inspectionOn && (
                  <>
                    {items.map((item, i) => (
                      <div key={item.label} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5, fontSize: 13 }}>
                        <span style={{ flex: 1 }}>{item.label}</span>
                        <div className="roletoggle">
                          {(['pass', 'fail', 'na'] as const).map((r) => (
                            <button key={r} type="button" className={item.result === r ? 'active' : ''}
                              onClick={() => setItems(items.map((x, j) => j === i ? { ...x, result: r } : x))}>
                              {r === 'na' ? 'N/A' : r}
                            </button>
                          ))}
                        </div>
                        <input className="plat-input" style={{ marginBottom: 0, width: 190 }} placeholder="Note" value={item.note ?? ''}
                          onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} />
                      </div>
                    ))}
                    <textarea className="plat-input" rows={2} placeholder="Overall notes…" value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} style={{ marginTop: 8 }} />
                  </>
                )}
              </>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <h3>Review & create</h3>
            <div className="fieldrow"><span>Title</span><span>{title || '—'}</span></div>
            <div className="fieldrow"><span>Consigner</span><span>
              {consignerMode === 'none' ? 'None' : consignerMode === 'existing'
                ? (consigners.find((c) => c.id === consignerId)?.company_name ?? '—')
                : `${newCompany} (new)`}
            </span></div>
            <div className="fieldrow"><span>Taxonomy</span><span>
              {[taxonomy?.categories.find((c) => c.id === categoryId)?.name,
                taxonomy?.makes.find((m) => m.id === makeId)?.name,
                models.find((m) => m.id === modelId)?.name].filter(Boolean).join(' / ') || 'unlinked'}
            </span></div>
            <div className="fieldrow"><span>Hours / condition</span><span>{hours || '—'} / {condition || '—'}</span></div>
            <div className="fieldrow"><span>Intake expenses</span><span>{expenses.length} totaling ${expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0).toLocaleString()}</span></div>
            <div className="fieldrow"><span>Inspection</span><span>{inspectionOn ? `${items.length} items → inspection document` : 'skipped'}</span></div>
            <div className="fieldrow">
              <span>Initial status</span>
              <span>
                <select className="plat-input type-select" value={initialStatus} onChange={(e) => setInitialStatus(e.target.value as 'available' | 'under_maintenance')}>
                  <option value="available">Available</option>
                  <option value="under_maintenance">In maintenance</option>
                </select>
              </span>
            </div>
            <div className="note">A unit is never born reserved (only an accepted offer reserves) or sold.</div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {step > 0 && <button className="plat-btn ghost" onClick={() => { setError(''); setStep(step - 1) }}>← Back</button>}
          {step < STEPS.length - 1 && <button className="plat-btn" onClick={next}>Next →</button>}
          {step === STEPS.length - 1 && (
            <button className="plat-btn" disabled={saving || !title.trim()} onClick={submit}>
              {saving ? 'Creating…' : 'Create unit'}
            </button>
          )}
        </div>
        {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      </div>
    </div>
  )
}
