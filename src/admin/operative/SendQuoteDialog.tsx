import { useEffect, useRef, useState } from 'react'
import { apiFetch, apiFormFetch } from '../../api/client'

// Antwort von GET /pwa/admin/quotes/{id}/send-attachments — steuert, welche
// Anhang-Quellen der Dialog anbietet (Feature-Flag prospekt_mit_offerte).
interface SendAttachmentsInfo {
  enabled: boolean
  project_id: string | null
  projekt_anhaenge: { id: string; filename: string }[]
  vorlagen: { id: string; filename: string }[]
}

interface Props {
  quoteId: number
  header: React.ReactNode
  defaultEmail?: string
  onClose: () => void
  onSent: (email: string) => void
}

const EMPTY_INFO: SendAttachmentsInfo = { enabled: false, project_id: null, projekt_anhaenge: [], vorlagen: [] }

// Gemeinsamer Versand-Dialog für Offerten (Offerten-Liste + Projekt-Detail) mit
// drei Anhang-Quellen: Projekt-Anhänge (Dokumente → Anhänge), direkt gewählte
// Dateien (werden beim Senden als Projekt-Anhang hochgeladen) und mandantenweite
// Vorlagen (Standard-Anhänge, z.B. AGB oder Produkt-Prospekte).
export function SendQuoteDialog({ quoteId, header, defaultEmail, onClose, onSent }: Props) {
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState<SendAttachmentsInfo>(EMPTY_INFO)
  const [selectedAnhaenge, setSelectedAnhaenge] = useState<Set<string>>(new Set())
  const [selectedVorlagen, setSelectedVorlagen] = useState<Set<string>>(new Set())
  const [directFiles, setDirectFiles] = useState<File[]>([])
  const [vorlagenSearch, setVorlagenSearch] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    apiFetch(`/pwa/admin/quotes/${quoteId}/send-attachments`)
      .then(res => {
        const i = res as SendAttachmentsInfo
        setInfo(i)
        // Projekt-Anhänge sind standardmässig alle angehakt (einzelne abwählbar);
        // Vorlagen bewusst NICHT vorausgewählt — die wählt der Admin gezielt aus.
        setSelectedAnhaenge(new Set(i.projekt_anhaenge.map(a => a.id)))
      })
      .catch(() => {
        // Anhang-Infos sind optional — bei Fehler bleibt der Versand ohne Zusatz-Anhang möglich.
      })
  }, [quoteId])

  function toggleAnhang(id: string) {
    setSelectedAnhaenge(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleVorlage(id: string) {
    setSelectedVorlagen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length > 0) {
      setDirectFiles(prev => {
        // Doppelte Auswahl (gleicher Name + gleiche Grösse) still ignorieren.
        const next = [...prev]
        for (const f of picked) {
          if (!next.some(x => x.name === f.name && x.size === f.size)) next.push(f)
        }
        return next
      })
    }
    // Zurücksetzen, damit dieselbe Datei nach dem Entfernen erneut wählbar ist.
    e.target.value = ''
  }

  function removeDirectFile(i: number) {
    setDirectFiles(prev => prev.filter((_, j) => j !== i))
  }

  async function handleSend() {
    if (!email) return
    setSending(true)
    setError('')
    try {
      // Direkt gewählte Dateien zuerst als Projekt-Dateien (Kategorie 'anhang')
      // hochladen — so landen sie dauerhaft beim Projekt unter Dokumente → Anhänge
      // und werden wie die übrigen Projekt-Anhänge mitversendet.
      const uploadedIds: string[] = []
      if (info.project_id) {
        for (const f of directFiles) {
          const form = new FormData()
          form.append('file', f)
          form.append('category', 'anhang')
          const res = await apiFormFetch(`/pwa/admin/projects/${info.project_id}/files`, form) as { file: { id: string } }
          uploadedIds.push(res.file.id)
        }
      }
      await apiFetch('/pwa/admin/quotes/send', {
        method: 'POST',
        body: JSON.stringify({
          quote_id: quoteId,
          recipient_email: email,
          anhang_file_ids: [...selectedAnhaenge, ...uploadedIds],
          vorlage_attachment_ids: [...selectedVorlagen],
        }),
      })
      onSent(email)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versand fehlgeschlagen')
      setSending(false)
    }
  }

  const search = vorlagenSearch.trim().toLowerCase()
  const filteredVorlagen = search
    ? info.vorlagen.filter(v => v.filename.toLowerCase().includes(search))
    : info.vorlagen

  return (
    <div className="admin-confirm-overlay">
      <div className="admin-confirm-box" style={{ maxWidth: 480 }}>
        <div className="admin-confirm-title">Offerte senden</div>
        <div className="admin-confirm-text" style={{ marginBottom: 12 }}>{header}</div>

        <div style={{ marginBottom: 12 }}>
          <label className="admin-form-label">Empfänger E-Mail</label>
          <input
            className="admin-form-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="kunde@example.com"
          />
        </div>

        {info.enabled && info.projekt_anhaenge.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label className="admin-form-label">Anhänge aus dem Projekt</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
              {info.projekt_anhaenge.map(a => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedAnhaenge.has(a.id)} onChange={() => toggleAnhang(a.id)} />
                  {a.filename}
                </label>
              ))}
            </div>
          </div>
        )}

        {info.enabled && info.project_id && (
          <div style={{ marginBottom: 12 }}>
            <label className="admin-form-label">Datei direkt anhängen</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              style={{ display: 'none' }}
              onChange={handlePickFiles}
            />
            {directFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, marginBottom: 8 }}>
                {directFiles.map((f, i) => (
                  <div key={`${f.name}-${f.size}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button
                      type="button"
                      className="admin-btn admin-btn-danger admin-btn-sm"
                      onClick={() => removeDirectFile(i)}
                      title="Entfernen"
                      aria-label="Datei entfernen"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              onClick={() => fileRef.current?.click()}
              disabled={sending}
            >
              + Datei wählen
            </button>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              Wird zusätzlich beim Projekt unter Dokumente → Anhänge abgelegt.
            </div>
          </div>
        )}

        {info.enabled && info.vorlagen.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label className="admin-form-label">Standard-Anhänge (Vorlagen)</label>
            {info.vorlagen.length > 5 && (
              <input
                className="admin-form-input"
                style={{ marginTop: 4 }}
                placeholder="Suchen…"
                value={vorlagenSearch}
                onChange={e => setVorlagenSearch(e.target.value)}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
              {filteredVorlagen.length === 0 ? (
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Keine Treffer.</span>
              ) : filteredVorlagen.map(v => (
                <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedVorlagen.has(v.id)} onChange={() => toggleVorlage(v.id)} />
                  {v.filename}
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="admin-confirm-actions">
          <button className="admin-btn admin-btn-secondary" onClick={onClose} disabled={sending}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary" onClick={handleSend} disabled={!email || sending}>
            {sending ? 'Wird gesendet…' : 'Offerte senden'}
          </button>
        </div>
      </div>
    </div>
  )
}
