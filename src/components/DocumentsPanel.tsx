import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type DocType, type DocumentRow } from '../lib/api'

// Documents & photos panel (build step 3c-8), shared by unit and deal
// detail. Upload is presigned two-step; the backend computes file_hash
// server-side (§3: the provenance backbone). Photos get a gallery and a
// primary flag (the inventory card's image) on units. While R2 is
// unprovisioned the panel renders the pending state — nothing breaks.

const DOC_TYPE_LABEL: Record<DocType, string> = {
  title: 'Title',
  lien_release: 'Lien release',
  bill_of_sale: 'Bill of sale',
  wire_instructions: 'Wire instructions',
  inspection: 'Inspection',
  agreement: 'Agreement',
  photo: 'Photo',
  other: 'Other',
}

interface DocumentsPanelProps {
  unitId?: string
  dealId?: string
}

export function DocumentsPanel({ unitId, dealId }: DocumentsPanelProps) {
  const parent = unitId ? { unit_id: unitId } : { deal_id: dealId! }
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [configured, setConfigured] = useState(true)
  const [docType, setDocType] = useState<DocType>(unitId ? 'photo' : 'other')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    api.documents(unitId ? { unit_id: unitId } : { deal_id: dealId })
      .then((res) => { setDocs(res.documents); setConfigured(res.configured); setError('') })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load documents'))
  }, [unitId, dealId])

  useEffect(() => { load() }, [load])

  async function onFilePicked(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    try {
      await api.uploadDocument(parent, docType, file)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function makePrimary(id: string) {
    try {
      await api.setPrimaryPhoto(id)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set primary')
    }
  }

  async function archive(id: string, name: string) {
    if (!window.confirm(`Archive "${name}"? The stored file is kept. Provenance is never erased.`)) return
    try {
      await api.archiveDocument(id)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive')
    }
  }

  async function download(doc: DocumentRow) {
    try {
      const res = await api.documentUrl(doc.id)
      window.open(res.url, '_blank', 'noopener')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get download link')
    }
  }

  const photos = unitId ? docs.filter((d) => d.doc_type === 'photo') : []
  const files = docs.filter((d) => d.doc_type !== 'photo' || !unitId)

  return (
    <div className="panel">
      <h3>Documents{unitId ? ' & photos' : ''}</h3>

      {!configured && (
        <div className="note" style={{ marginBottom: 10 }}>
          Document storage is pending. R2 needs one-time enablement on the Cloudflare
          account plus a bucket token (steps are in the session log). Existing rows and
          everything else keep working; uploads unlock the moment the credentials land.
        </div>
      )}

      {configured && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <select className="plat-input" style={{ marginBottom: 0, maxWidth: 170 }} value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
            {(Object.keys(DOC_TYPE_LABEL) as DocType[])
              .filter((t) => unitId || t !== 'photo')
              .map((t) => (<option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>))}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept={docType === 'photo' ? 'image/*' : undefined}
            disabled={busy}
            onChange={(e) => onFilePicked(e.target.files)}
            style={{ fontSize: 12 }}
          />
          {busy && <span className="note">Uploading & hashing…</span>}
        </div>
      )}

      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((p) => (
            <div className={`photo-cell${p.is_primary ? ' primary' : ''}`} key={p.id}>
              {p.url
                ? <img src={p.url} alt={p.file_name} onClick={() => download(p)} />
                : <div className="photo-missing">{p.file_name}</div>}
              <div className="photo-actions">
                {p.is_primary
                  ? <span className="pill gold">primary</span>
                  : <button className="plat-btn ghost" onClick={() => makePrimary(p.id)}>Make primary</button>}
                <button className="plat-btn ghost" onClick={() => archive(p.id, p.file_name)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {files.length === 0 && photos.length === 0 ? (
        <div className="note">No documents yet.</div>
      ) : (
        files.map((d) => (
          <div className="hist-item" key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span className="pill grey">{DOC_TYPE_LABEL[d.doc_type]}</span>
            <a style={{ cursor: 'pointer', fontWeight: 'bold' }} onClick={() => download(d)}>{d.file_name}</a>
            <span className="when" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              {d.uploaded_by_name ?? '—'} · {new Date(d.uploaded_at).toLocaleDateString()}
            </span>
            <span className="when" title={`sha256 ${d.file_hash}`}>#{d.file_hash.slice(0, 8)}</span>
            <button className="plat-btn ghost" onClick={() => archive(d.id, d.file_name)}>✕</button>
          </div>
        ))
      )}
      {error && <div className="note" style={{ color: '#B4432B' }}>{error}</div>}
      <div className="note">
        Every file carries a server-computed SHA-256. A document that changed is detectable,
        not arguable.
      </div>
    </div>
  )
}
