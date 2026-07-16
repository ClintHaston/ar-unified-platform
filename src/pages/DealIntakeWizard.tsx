import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, type ContactHit, type DealDryRun, type ListingFieldsResponse,
         type Pipeline, type SpecAvailability } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { TabListingPanel } from '../components/TabListingPanel'
import { DocumentsPanel } from '../components/DocumentsPanel'

// Item 3: the stage-by-stage deal intake wizard that retires the Sales Command
// single-deal path. Layout follows the Amd-21 unit intake wizard, but the write
// model is different and has to be: TabListingPanel needs a real deal id on
// mount and writes on every interaction, so the deal is created at step 1 and
// the wizard is progressive-write rather than all-at-once.
//
// That is exactly why the deal is born a DRAFT (in_intake). Until the wizard
// finishes, its board card carries an "In intake" pill so a half-finished
// intake is never mistaken for a worked deal. Finishing clears the marker;
// abandoning archives the draft.
//
// Runs live in preview: creation enqueues a disarmed outbox row, the publish
// request only sets the resubmit_to_tab gate, and the dry-run is pure. Nothing
// reaches TAB or HubSpot until cutover arms them.

const STEPS = ['Deal basics', 'Listing fields', 'Description', 'Photos', 'Review'] as const

// The wizard lands deals here: the stage the TAB publish path triggers on.
const PUBLISH_STAGE_NAME = 'Requested'

function errText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function DealIntakeWizard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const isAdmin = user?.role === 'admin'

  const [step, setStep] = useState(0)
  const [dealId, setDealId] = useState<string | null>(params.get('deal'))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // step 1 — deal basics
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [pipelineId, setPipelineId] = useState('')
  const [stageId, setStageId] = useState('')
  const [name, setName] = useState('')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<ContactHit[]>([])
  const [contact, setContact] = useState<ContactHit | null>(null)
  const [value, setValue] = useState('')
  const [commission, setCommission] = useState('')
  const [expectedClose, setExpectedClose] = useState('')

  // step 3 — spec description
  const [avail, setAvail] = useState<SpecAvailability | null>(null)
  const [description, setDescription] = useState('')
  const [savedNote, setSavedNote] = useState('')

  // step 4/5
  const [fields, setFields] = useState<ListingFieldsResponse | null>(null)
  const [dryRun, setDryRun] = useState<DealDryRun | null>(null)

  // Resume a stranded draft: ?deal=<id> reopens where the rep left off.
  useEffect(() => {
    const resumeId = params.get('deal')
    if (!resumeId) return
    api.intakeState(resumeId)
      .then((s) => {
        if (!s.in_intake) { navigate(`/deals/${resumeId}`, { replace: true }); return }
        setDealId(resumeId)
        setStep(Math.min(Math.max(s.step, 1), STEPS.length - 1))
      })
      .catch((err: unknown) => setError(errText(err, 'Could not reopen this intake')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    api.pipelines()
      .then((res) => {
        const sell = res.pipelines.filter((p) => p.kind !== 'buy')
        setPipelines(sell)
        if (sell.length === 0) return
        setPipelineId(sell[0].id)
        const requested = sell[0].stages.find((s) => s.name === PUBLISH_STAGE_NAME)
        setStageId(requested?.id ?? sell[0].stages[0]?.id ?? '')
      })
      .catch((err: unknown) => setError(errText(err, 'Failed to load pipelines')))
  }, [])

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return }
    let live = true
    const t = setTimeout(() => {
      api.searchContacts(q.trim())
        .then((res) => { if (live) setHits(res.contacts) })
        .catch(() => { if (live) setHits([]) })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  const activePipeline = useMemo(
    () => pipelines.find((p) => p.id === pipelineId), [pipelines, pipelineId])

  // Entering Review re-derives first. photos_ready is derived from the unit,
  // but the derive on the listing-fields step ran before the photos step
  // existed, so without this the rep lands here stuck on "missing
  // photos_ready" with no obvious fix. derive fills empties only, so it can
  // never overwrite what the rep typed.
  const loadReview = useCallback(async (id: string) => {
    try {
      await api.deriveListingFields(id)
    } catch {
      // A derive failure is not fatal here: the fields load below still shows
      // the rep exactly what is missing.
    }
    try {
      setFields(await api.listingFields(id))
      setDryRun(await api.dealDryRun(id))
    } catch (err) {
      setError(errText(err, 'Could not load the review'))
    }
  }, [])

  const loadAvailability = useCallback(async (id: string) => {
    try {
      const a = await api.specAvailability(id)
      setAvail(a)
      if (a.existing_description) setDescription(a.existing_description)
    } catch (err) {
      setError(errText(err, 'Could not check the Spec Builder'))
    }
  }, [])

  // Steps 3, 4 and 5 each read fresh server state on entry.
  useEffect(() => {
    if (!dealId) return
    if (step === 2) { void loadAvailability(dealId) }
    if (step === 3 && !avail) { void loadAvailability(dealId) }
    if (step === 4) { void loadReview(dealId) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, dealId])

  function onPipelineChange(id: string) {
    setPipelineId(id)
    const p = pipelines.find((pp) => pp.id === id)
    const requested = p?.stages.find((s) => s.name === PUBLISH_STAGE_NAME)
    setStageId(requested?.id ?? p?.stages[0]?.id ?? '')
  }

  // Step 1 is the only step that creates. Every later step edits the draft.
  async function createDraft() {
    if (!pipelineId || !stageId || !name.trim()) return
    setBusy(true); setError('')
    try {
      const cents = value.trim() === '' ? null : Math.round(parseFloat(value) * 100)
      const pct = commission.trim() === '' ? null : parseFloat(commission)
      const res = await api.createDeal({
        pipeline_id: pipelineId,
        stage_id: stageId,
        name: name.trim(),
        contact_id: contact?.id ?? null,
        value_cents: cents !== null && !Number.isNaN(cents) ? cents : null,
        commission_pct: pct !== null && !Number.isNaN(pct) ? pct : null,
        expected_close: expectedClose || null,
        in_intake: true,
      })
      setDealId(res.id)
      setParams({ deal: res.id }, { replace: true })
      setStep(1)
      void api.recordIntakeStep(res.id, 1)
    } catch (err) {
      setError(errText(err, 'Failed to create the deal'))
    } finally {
      setBusy(false)
    }
  }

  async function next() {
    setError('')
    if (step === 0) { await createDraft(); return }
    const to = Math.min(step + 1, STEPS.length - 1)
    setStep(to)
    if (dealId) void api.recordIntakeStep(dealId, to)
  }

  function back() {
    setError('')
    setStep((s) => Math.max(s - 1, dealId ? 1 : 0))
  }

  async function finish() {
    if (!dealId) return
    setBusy(true); setError('')
    try {
      await api.completeIntake(dealId)
      navigate(`/deals/${dealId}`)
    } catch (err) {
      setError(errText(err, 'Could not finish the intake'))
      setBusy(false)
    }
  }

  async function abandon() {
    if (!dealId) return
    const ok = window.confirm(
      'Abandon this intake? The draft deal will be archived. You can still find '
      + 'it in the audit trail, but it will leave the board.')
    if (!ok) return
    setBusy(true); setError('')
    try {
      await api.abandonIntake(dealId)
      navigate('/pipelines')
    } catch (err) {
      setError(errText(err, 'Could not abandon this intake'))
      setBusy(false)
    }
  }

  async function generate() {
    if (!dealId) return
    setBusy(true); setError(''); setSavedNote('')
    try {
      const res = await api.generateSpecDescription(dealId)
      setAvail(res)
      if (res.ok && res.description) setDescription(res.description)
    } catch (err) {
      setError(errText(err, 'The Spec Builder could not be reached'))
    } finally {
      setBusy(false)
    }
  }

  async function saveDescription() {
    if (!dealId || !description.trim()) return
    setBusy(true); setError(''); setSavedNote('')
    try {
      const res = await api.saveSpecDescription(dealId, description.trim())
      setSavedNote(res.both_keys
        ? `Saved and linked to both this deal and TAB listing ${res.tab_listing_id}.`
        : 'Saved to this deal. It will link to the TAB listing once the unit is published.')
    } catch (err) {
      setError(errText(err, 'Could not save the description'))
    } finally {
      setBusy(false)
    }
  }

  const canNext = step === 0 ? !!(name.trim() && stageId) : true

  return (
    <div style={{ maxWidth: 860 }}>
      <Link to="/pipelines" className="back-link">← Back to pipelines</Link>

      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <span key={s} className={`wizard-step${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {dealId && (
        <div className="note" style={{ marginBottom: 8 }}>
          <span className="pill gold">In intake</span>{' '}
          This deal is a draft until you finish. It shows as In intake on the board
          so nobody mistakes it for a worked deal.
        </div>
      )}

      <div className="panel">
        {step === 0 && (
          <>
            <h3>Deal basics</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ flex: '1 1 220px', fontSize: 12, color: 'var(--p-body)' }}>
                Pipeline
                <select className="plat-input" value={pipelineId}
                        onChange={(e) => onPipelineChange(e.target.value)}>
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label style={{ flex: '1 1 220px', fontSize: 12, color: 'var(--p-body)' }}>
                Stage
                <select className="plat-input" value={stageId}
                        onChange={(e) => setStageId(e.target.value)}>
                  {(activePipeline?.stages ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label style={{ fontSize: 12, color: 'var(--p-body)' }}>
              Deal name
              <input className="plat-input" placeholder="e.g. 2018 Cat 336 excavator, listing"
                     value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <div style={{ fontSize: 12, color: 'var(--p-body)', marginTop: 4 }}>Contact (optional)</div>
            {contact ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="pill gold">{contact.name ?? 'Contact'}</span>
                {contact.company_name && (
                  <span style={{ fontSize: 12, color: 'var(--p-body)' }}>{contact.company_name}</span>
                )}
                <button className="plat-btn ghost" onClick={() => { setContact(null); setQ('') }}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <input className="plat-input" placeholder="Search a contact by name / email…"
                       value={q} onChange={(e) => setQ(e.target.value)} />
                {hits.length > 0 && (
                  <div style={{ border: '1px solid var(--p-steel)', borderRadius: 6,
                                marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
                    {hits.map((h) => (
                      <div key={h.id} onClick={() => { setContact(h); setHits([]) }}
                           style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13,
                                    borderBottom: '1px solid var(--p-row)' }}>
                        <b>{h.name ?? 'Unnamed'}</b>
                        {h.company_name ? ` · ${h.company_name}` : ''}
                      </div>
                    ))}
                  </div>
                )}
                <div className="note" style={{ marginTop: 4 }}>
                  Company auto-derives from the chosen contact.
                </div>
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
                <input className="plat-input" type="number" min="0" max="100" step="0.1"
                       placeholder="optional" value={commission}
                       onChange={(e) => setCommission(e.target.value)} />
              </label>
              <label style={{ flex: '1 1 160px', fontSize: 12, color: 'var(--p-body)' }}>
                Expected close
                <input className="plat-input" type="date" value={expectedClose}
                       onChange={(e) => setExpectedClose(e.target.value)} />
              </label>
            </div>
            <div className="note" style={{ marginTop: 6 }}>
              Creating the deal starts the intake. It lands at {PUBLISH_STAGE_NAME} and stays
              a draft until you finish this wizard.
            </div>
          </>
        )}

        {step === 1 && dealId && (
          <>
            <h3>Listing fields</h3>
            <div className="note" style={{ marginBottom: 8 }}>
              Link the unit this deal is selling, then derive or type the listing fields.
              Linking a unit is what lets the next steps build a description and attach photos.
            </div>
            <TabListingPanel dealId={dealId} />
          </>
        )}

        {step === 2 && dealId && (
          <>
            <h3>Description</h3>
            {!avail && <div className="note">Checking the Spec Builder…</div>}

            {avail && !avail.unit_linked && (
              <div className="note" style={{ color: '#B4432B' }}>
                No unit is linked yet. Go back to Listing fields and link the unit first,
                then the Spec Builder can describe it.
              </div>
            )}

            {avail && avail.unit_linked && (
              <>
                <div className="note">
                  Unit: <b>{avail.unit_title}</b>
                  {avail.equipment_type ? ` · ${avail.equipment_type}` : ''}
                  {avail.make ? ` · ${avail.make}` : ''}
                  {avail.model ? ` ${avail.model}` : ''}
                  {avail.year ? ` · ${avail.year}` : ''}
                </div>

                {/* No legacy_id = this unit is not on TAB yet. Say so plainly rather
                    than writing a NULL join key and letting the sales sheet go blind. */}
                {!avail.has_legacy_id && (
                  <div className="note" style={{ color: '#8A6A1F' }}>
                    This unit is not on TAB yet, so it has no listing number. The description
                    will be saved against this deal only. It links to the listing
                    automatically once the unit is published to TAB.
                  </div>
                )}

                {avail.blockers.length > 0 && (
                  <div className="note" style={{ color: '#B4432B' }}>
                    {avail.blockers.map((b) => <div key={b}>{b}</div>)}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
                  <button className="plat-btn" disabled={busy || !avail.can_generate}
                          title={avail.can_generate ? '' : 'The Spec Builder cannot describe this unit; type the description instead'}
                          onClick={generate}>
                    {busy ? 'Working…' : 'Generate description'}
                  </button>
                  <button className="plat-btn ghost" disabled={busy || !description.trim()}
                          onClick={saveDescription}>
                    Save description
                  </button>
                </div>

                <textarea className="plat-input" rows={14} value={description}
                          placeholder={avail.template_available
                            ? 'Generate a description, then edit it here before saving.'
                            : 'No spec template covers this equipment type. Type the description here.'}
                          onChange={(e) => { setDescription(e.target.value); setSavedNote('') }} />
                <div className="note">
                  Review and edit before saving. What you save here is the description that
                  publishes to TAB and shows on the sales sheet.
                </div>
                {savedNote && (
                  <div className="note" style={{ color: '#2E6F40' }}>{savedNote}</div>
                )}
              </>
            )}
          </>
        )}

        {step === 3 && dealId && (
          <>
            <h3>Photos</h3>
            {avail?.unit_id ? (
              <>
                <div className="note" style={{ marginBottom: 8 }}>
                  Photos attach to the unit, not the deal. That is what the listing checks:
                  the photos ready field turns true once this unit has at least one photo.
                </div>
                <DocumentsPanel unitId={avail.unit_id} />
              </>
            ) : (
              <div className="note" style={{ color: '#B4432B' }}>
                No unit is linked yet. Photos attach to the unit, so link one on the
                Listing fields step first.
              </div>
            )}
          </>
        )}

        {step === 4 && dealId && (
          <>
            <h3>Review and push to TAB</h3>

            {fields && (
              <div className="note" style={{ color: fields.publishable ? '#2E6F40' : '#B4432B' }}>
                {fields.publishable
                  ? 'All 14 listing fields are complete. This deal is ready to publish.'
                  : `Not ready to publish. Missing: ${fields.missing.join(', ')}`}
              </div>
            )}

            {dryRun && (
              <>
                <div className="note" style={{ marginTop: 8 }}>
                  Dry run says: <b>{dryRun.plan.action}</b>
                  {dryRun.plan.published_with_spec ? ' (using the description you approved)' : ''}
                </div>
                {dryRun.plan.tab_payload ? (
                  <pre style={{ background: 'var(--p-row)', border: '1px solid var(--p-steel)',
                                borderRadius: 6, padding: 10, fontSize: 11, maxHeight: 300,
                                overflow: 'auto' }}>
                    {JSON.stringify(dryRun.plan.tab_payload, null, 2)}
                  </pre>
                ) : (
                  <div className="note">
                    Nothing would be sent yet. Complete the listing fields to see the payload.
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="plat-btn" disabled={busy || !fields?.publishable
                                                     || fields?.resubmit_to_tab}
                      onClick={async () => {
                        if (!dealId) return
                        setBusy(true); setError('')
                        try {
                          await api.requestTabPublish(dealId)
                          setFields(await api.listingFields(dealId))
                          setDryRun(await api.dealDryRun(dealId))
                        } catch (err) {
                          setError(errText(err, 'Could not queue the publish'))
                        } finally { setBusy(false) }
                      }}>
                {fields?.resubmit_to_tab ? 'Queued for publish' : 'Queue for TAB publish'}
              </button>
              <button className="plat-btn" disabled={busy} onClick={finish}>
                Finish intake
              </button>
            </div>

            <div className="note" style={{ marginTop: 8 }}>
              Publishing is disarmed until cutover. Queuing records the request against this
              deal and nothing is sent to TAB now. Finishing the intake clears the draft
              marker and the deal becomes a normal deal on the board.
            </div>
          </>
        )}
      </div>

      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        {step > (dealId ? 1 : 0) && (
          <button className="plat-btn ghost" onClick={back} disabled={busy}>Back</button>
        )}
        {step < STEPS.length - 1 && (
          <button className="plat-btn" onClick={next} disabled={busy || !canNext}>
            {step === 0 ? (busy ? 'Creating…' : 'Create deal and continue') : 'Next'}
          </button>
        )}
        {dealId && (
          <button className="plat-btn ghost" onClick={abandon} disabled={busy}
                  style={{ marginLeft: 'auto', color: '#B4432B' }}>
            Abandon intake
          </button>
        )}
      </div>
      {isAdmin && dealId && (
        <div className="note" style={{ marginTop: 6 }}>
          Draft deal id: {dealId}
        </div>
      )}
    </div>
  )
}
