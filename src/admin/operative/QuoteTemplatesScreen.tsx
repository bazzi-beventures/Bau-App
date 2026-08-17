import { useEffect, useRef, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { apiFetch, apiFormFetch, apiUrl } from '../../api/client'
import { getMe } from '../../api/auth'
import { isFeatureEnabled } from '../../api/modules'
import { fmtDate } from '../utils/format'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useToast, ToastHost } from '../components/useToast'
import { useTenantText, TenantTextSetting } from '../components/TenantTextSetting'

// Vorlagen für die Offerten-Sektionen "Montagepositionen" und "Sonderpositionen".
// Spiegelt die Schnell-Buttons im Offerte-Formular — hier zentral pflegbar, ohne Migration.
//
// Die reinen Textbausteine (Bemerkungen, Disclaimer, Mail-Texte …) laufen über
// useTenantText/<TenantTextSetting/> — ein Baustein pro Endpoint der Backend-
// Factory make_tenant_text_endpoints. Nur Positions-Vorlagen, Standard-Anhänge
// und die Skonto-Vorgabe (zwei Zahlen, eigener Vertrag) haben eigenen Code.

interface InstallationTpl {
  id: string
  label: string
  default_fee: number
  sort_order: number
  notes: string | null
}

type SpecialMode = 'pauschal' | 'stunden'

interface SpecialTpl {
  id: string
  label: string
  pricing_mode: SpecialMode
  default_fee: number
  default_hours: number | null
  sort_order: number
  notes: string | null
}

// Standard-Anhänge: mandantenweite Dokumente (AGB, Firmenprospekt …), die beim
// Offerten-Versand als Mail-Anhang wählbar sind (Feature 'prospekt_mit_offerte').
interface QuoteAttachmentTpl {
  id: string
  filename: string
  mime_type: string | null
  file_size: number | null
  created_at: string
}

// Dateigrösse menschenlesbar — die API liefert Bytes.
function fmtBytes(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

type Kind = 'installation' | 'special'

interface EditState {
  kind: Kind
  // 'new' = anlegen, sonst die zu bearbeitende ID
  id: string | 'new'
}

interface FormState {
  label: string
  default_fee: string
  pricing_mode: SpecialMode
  default_hours: string
  notes: string
}

const EMPTY_FORM: FormState = { label: '', default_fee: '', pricing_mode: 'pauschal', default_hours: '', notes: '' }

function OffertenVorlagenPanel() {
  const [installation, setInstallation] = useState<InstallationTpl[]>([])
  const [special, setSpecial] = useState<SpecialTpl[]>([])
  const [specialFeatureOn, setSpecialFeatureOn] = useState(true)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  // Stand beim Öffnen des Modals — Vergleichswert für den Dirty-Check. Ein Klick
  // neben das Fenster darf eine angefangene Vorlage nicht kommentarlos wegwerfen.
  const [formOpened, setFormOpened] = useState<FormState>(EMPTY_FORM)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { toast, showToast } = useToast()
  const [richtoffAvailable, setRichtoffAvailable] = useState(false)

  // Textbausteine — je Endpoint ein Hook; Semantik (2-/3-Zustand, Reset-Payload)
  // siehe TenantTextSetting.tsx.
  const stdNotes = useTenantText('/pwa/admin/quote-standard-notes', 'notes', {
    showToast, savedMsg: 'Standard-Bemerkungen gespeichert', resetPayload: '',
  })
  const disc = useTenantText('/pwa/admin/quote-footer-disclaimer', 'disclaimer', {
    showToast, savedMsg: 'Disclaimer gespeichert',
  })
  const discR = useTenantText('/pwa/admin/quote-footer-disclaimer-richtofferte', 'disclaimer', {
    showToast, savedMsg: 'Disclaimer (Richtofferte) gespeichert',
  })
  const skontoText = useTenantText('/pwa/admin/quote-skonto-text', 'text', {
    showToast, savedMsg: 'Skonto-Begleittext gespeichert',
  })
  const thankyou = useTenantText('/pwa/admin/quote-thankyou-text', 'text', {
    showToast, savedMsg: 'Danke-Text gespeichert',
  })
  const rejection = useTenantText('/pwa/admin/quote-rejection-text', 'text', {
    showToast, savedMsg: 'Absage-Text gespeichert',
  })
  const textsLoading = [stdNotes, disc, discR, skontoText, thankyou, rejection].some(s => s.loading)

  // Skonto-Vorgabe: belegt die beiden Skonto-Felder im Erstell-Formular vor. Leer =
  // keine Vorgabe. Beide Felder als String im State (Eingabefeld), Zahl erst beim Speichern.
  const [skontoDefPct, setSkontoDefPct] = useState('')
  const [skontoDefDays, setSkontoDefDays] = useState('')
  const [skontoDefSaved, setSkontoDefSaved] = useState({ pct: '', days: '' })
  const [savingSkontoDef, setSavingSkontoDef] = useState(false)
  // Standard-Anhänge: pflegbar auch bei deaktiviertem Feature (nur der Versand-Dialog
  // hängt am Flag) — analog zu den Sonderpositionen mit Hinweis statt Ausblenden.
  const [attachments, setAttachments] = useState<QuoteAttachmentTpl[]>([])
  const [attSearch, setAttSearch] = useState('')
  const [attUploading, setAttUploading] = useState(false)
  const [attDeleting, setAttDeleting] = useState<string | null>(null)
  const [anhangFeatureOn, setAnhangFeatureOn] = useState(true)
  const attFileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    try {
      const [data, skontoDef, att] = await Promise.all([
        apiFetch('/pwa/admin/quote-position-templates') as Promise<{ installation: InstallationTpl[]; special: SpecialTpl[] }>,
        apiFetch('/pwa/admin/quote-skonto-defaults') as Promise<{ pct: number | null; days: number | null }>,
        apiFetch('/pwa/admin/quote-attachment-templates') as Promise<{ attachments: QuoteAttachmentTpl[] }>,
      ])
      setInstallation(data.installation ?? [])
      setSpecial(data.special ?? [])
      setAttachments(att.attachments ?? [])
      const defPct = skontoDef.pct != null ? String(skontoDef.pct) : ''
      const defDays = skontoDef.days != null ? String(skontoDef.days) : ''
      setSkontoDefPct(defPct)
      setSkontoDefDays(defDays)
      setSkontoDefSaved({ pct: defPct, days: defDays })
    } finally {
      setLoading(false)
    }
  }

  // Vorgabe speichern. `clear` leert beide Felder (Vorgabe entfernen) — serverseitig
  // führt ein fehlender/ungültiger %-Satz ohnehin zu NULL in beiden Spalten.
  async function saveQuoteSkontoDefaults(clear = false) {
    setSavingSkontoDef(true)
    setError('')
    try {
      const pct = clear || skontoDefPct.trim() === '' ? null : parseFloat(skontoDefPct.replace(',', '.'))
      const days = clear || skontoDefDays.trim() === '' ? null : parseInt(skontoDefDays, 10)
      const res = await apiFetch('/pwa/admin/quote-skonto-defaults', {
        method: 'PATCH',
        body: JSON.stringify({
          pct: pct != null && !isNaN(pct) ? pct : null,
          days: days != null && !isNaN(days) ? days : null,
        }),
      }) as { pct: number | null; days: number | null }
      // Antwort ist die normalisierte Wahrheit (z.B. 150% => keine Vorgabe) — sie
      // zurückschreiben, sonst zeigt das Formular einen Wert, den der Server verworfen hat.
      const nextPct = res.pct != null ? String(res.pct) : ''
      const nextDays = res.days != null ? String(res.days) : ''
      setSkontoDefPct(nextPct)
      setSkontoDefDays(nextDays)
      setSkontoDefSaved({ pct: nextPct, days: nextDays })
      showToast(res.pct == null ? 'Skonto-Vorgabe entfernt' : 'Skonto-Vorgabe gespeichert')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSavingSkontoDef(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    getMe().then(me => {
      setSpecialFeatureOn(isFeatureEnabled(me, 'sonderpositionen'))
      setRichtoffAvailable(isFeatureEnabled(me, 'richtofferte'))
      setAnhangFeatureOn(isFeatureEnabled(me, 'prospekt_mit_offerte'))
    }).catch(() => {})
  }, [])

  function openEditor(state: EditState, f: FormState) {
    setForm(f)
    setFormOpened(f)
    setEditing(state)
    setError('')
    setConfirmDiscard(false)
  }

  function closeEditor() {
    setEditing(null)
    setConfirmDiscard(false)
  }

  // Hat der Nutzer seit dem Öffnen etwas eingetippt? Nur dann fragt der
  // Backdrop-Klick nach, statt die Eingaben wegzuwerfen.
  const formIsDirty = (Object.keys(form) as (keyof FormState)[]).some(k => form[k] !== formOpened[k])

  function openNew(kind: Kind) {
    openEditor({ kind, id: 'new' }, EMPTY_FORM)
  }

  function openEditInstallation(t: InstallationTpl) {
    openEditor(
      { kind: 'installation', id: t.id },
      { ...EMPTY_FORM, label: t.label, default_fee: String(t.default_fee), notes: t.notes ?? '' },
    )
  }

  function openEditSpecial(t: SpecialTpl) {
    openEditor({ kind: 'special', id: t.id }, {
      label: t.label,
      default_fee: String(t.default_fee),
      pricing_mode: t.pricing_mode,
      default_hours: t.default_hours != null ? String(t.default_hours) : '',
      notes: t.notes ?? '',
    })
  }

  function basePath(kind: Kind) {
    return kind === 'installation' ? '/pwa/admin/installation-templates' : '/pwa/admin/special-position-templates'
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    const fee = parseFloat(form.default_fee.replace(',', '.'))
    if (!form.label.trim() || isNaN(fee) || fee < 0) return
    if (editing.kind === 'special' && form.pricing_mode === 'stunden') {
      const h = parseFloat(form.default_hours.replace(',', '.'))
      if (isNaN(h) || h <= 0) { setError('Bitte gültige Stundenzahl angeben'); return }
    }
    setSaving(true)
    setError('')
    try {
      const isEdit = editing.id !== 'new'
      const url = isEdit ? `${basePath(editing.kind)}/${editing.id}` : basePath(editing.kind)
      const body: Record<string, unknown> = {
        label: form.label.trim(),
        default_fee: fee,
        notes: form.notes.trim() || null,
      }
      if (editing.kind === 'special') {
        body.pricing_mode = form.pricing_mode
        body.default_hours = form.pricing_mode === 'stunden' ? parseFloat(form.default_hours.replace(',', '.')) : null
      }
      await apiFetch(url, { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(body) })
      closeEditor()
      showToast('Vorlage gespeichert')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editing || editing.id === 'new') return
    if (!window.confirm(`Vorlage "${form.label}" wirklich löschen?`)) return
    setSaving(true)
    setError('')
    try {
      await apiFetch(`${basePath(editing.kind)}/${editing.id}`, { method: 'DELETE' })
      closeEditor()
      showToast('Vorlage gelöscht')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = '' // gleiche Datei erneut auswählbar machen
    if (files.length === 0) return
    setAttUploading(true)
    setError('')
    try {
      // Sequentiell statt parallel — so bleibt bei einem Fehler klar, welche Dateien
      // schon durch sind, und der Upload-Endpoint wird nicht geflutet.
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        await apiFormFetch('/pwa/admin/quote-attachment-templates', form)
      }
      showToast(files.length === 1 ? 'Anhang hochgeladen' : `${files.length} Anhänge hochgeladen`)
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setAttUploading(false)
    }
  }

  async function handleAttachmentDelete(a: QuoteAttachmentTpl) {
    if (!window.confirm(`Anhang "${a.filename}" wirklich löschen?`)) return
    setAttDeleting(a.id)
    setError('')
    try {
      await apiFetch(`/pwa/admin/quote-attachment-templates/${a.id}`, { method: 'DELETE' })
      showToast('Anhang gelöscht')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setAttDeleting(null)
    }
  }

  const isSpecialModal = editing?.kind === 'special'
  const attFiltered = attSearch.trim()
    ? attachments.filter(a => a.filename.toLowerCase().includes(attSearch.trim().toLowerCase()))
    : attachments

  return (
    <>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Offert-Vorlagen</div>
          <div className="admin-page-subtitle">Schnell-Buttons für Montage- und Sonderpositionen im Offerte-Formular</div>
        </div>
      </div>

      {loading || textsLoading ? (
        <div className="admin-table-wrap"><div className="admin-loading"><div className="admin-spinner" /> Laden…</div></div>
      ) : (
        <>
          {/* ── Montagepositionen ── */}
          <div className="admin-page-header" style={{ marginTop: 8 }}>
            <div>
              <div className="admin-page-title" style={{ fontSize: 18 }}>Montagepositionen</div>
              <div className="admin-page-subtitle">Pauschalbeträge für Montageleistungen</div>
            </div>
            <button className="admin-btn admin-btn-primary" onClick={() => openNew('installation')}>+ Neue Montage-Vorlage</button>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Bezeichnung</th><th>Betrag</th><th>Notiz</th><th></th></tr>
              </thead>
              <tbody>
                {installation.length === 0 ? (
                  <tr><td colSpan={4} className="admin-table-empty">Keine Montage-Vorlagen definiert.</td></tr>
                ) : installation.map(t => (
                  <tr key={t.id} onClick={() => openEditInstallation(t)} style={{ cursor: 'pointer' }}>
                    <td><strong>{t.label}</strong></td>
                    <td style={{ fontWeight: 700 }}>CHF {t.default_fee.toFixed(2)}</td>
                    <td style={{ color: 'var(--muted)' }}>{t.notes || '—'}</td>
                    <td>
                      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={e => { e.stopPropagation(); openEditInstallation(t) }}>Bearbeiten</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Sonderpositionen ── */}
          <div className="admin-page-header" style={{ marginTop: 24 }}>
            <div>
              <div className="admin-page-title" style={{ fontSize: 18 }}>Sonderpositionen (Demontage / Entsorgung)</div>
              <div className="admin-page-subtitle">Pauschale oder Stundenansatz — getrennt von Montage/Material ausgewiesen</div>
            </div>
            <button className="admin-btn admin-btn-primary" onClick={() => openNew('special')}>+ Neue Sonderposition</button>
          </div>
          {!specialFeatureOn && (
            <div className="admin-form-hint" style={{ margin: '0 0 12px' }}>
              Hinweis: Das Feature „Sonderpositionen" ist für diesen Mandanten aktuell deaktiviert — diese Vorlagen
              erscheinen erst im Offerte-Formular, wenn du es unter Konfiguration aktivierst. Du kannst sie hier
              trotzdem schon vorbereiten.
            </div>
          )}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Bezeichnung</th><th>Modus</th><th>Betrag</th><th>Notiz</th><th></th></tr>
              </thead>
              <tbody>
                {special.length === 0 ? (
                  <tr><td colSpan={5} className="admin-table-empty">Keine Sonderpositionen definiert.</td></tr>
                ) : special.map(t => (
                  <tr key={t.id} onClick={() => openEditSpecial(t)} style={{ cursor: 'pointer' }}>
                    <td><strong>{t.label}</strong></td>
                    <td style={{ color: 'var(--muted)' }}>{t.pricing_mode === 'stunden' ? 'Stundenansatz' : 'Pauschale'}</td>
                    <td style={{ fontWeight: 700 }}>
                      {t.pricing_mode === 'stunden'
                        ? `CHF ${t.default_fee.toFixed(2)}/h${t.default_hours != null ? ` × ${t.default_hours}` : ''}`
                        : `CHF ${t.default_fee.toFixed(2)}`}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{t.notes || '—'}</td>
                    <td>
                      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={e => { e.stopPropagation(); openEditSpecial(t) }}>Bearbeiten</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Standard-Anhänge ── */}
          <div className="admin-page-header" style={{ marginTop: 24 }}>
            <div>
              <div className="admin-page-title" style={{ fontSize: 18 }}>Standard-Anhänge</div>
              <div className="admin-page-subtitle">
                Dokumente (z.B. AGB, Firmenprospekt), die beim Versenden einer Offerte als Anhang wählbar sind.
              </div>
            </div>
            <button
              className="admin-btn admin-btn-primary"
              onClick={() => attFileRef.current?.click()}
              disabled={attUploading}
            >
              {attUploading ? 'Wird hochgeladen…' : '+ Anhang hochladen'}
            </button>
            <input
              ref={attFileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              style={{ display: 'none' }}
              onChange={handleAttachmentUpload}
            />
          </div>
          {!anhangFeatureOn && (
            <div className="admin-form-hint" style={{ margin: '0 0 12px' }}>
              Das Feature „Anhänge mit der Offerte versenden" ist für diesen Mandanten aktuell deaktiviert —
              die Anhänge erscheinen erst im Versand-Dialog, wenn du es unter Konfiguration aktivierst.
              Du kannst sie hier trotzdem schon vorbereiten.
            </div>
          )}
          {attachments.length > 5 && (
            <input
              className="admin-form-input"
              value={attSearch}
              onChange={e => setAttSearch(e.target.value)}
              placeholder="Anhänge durchsuchen…"
              style={{ maxWidth: 320, marginBottom: 12 }}
            />
          )}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Datei</th><th>Grösse</th><th>Hochgeladen</th><th></th></tr>
              </thead>
              <tbody>
                {attachments.length === 0 ? (
                  <tr><td colSpan={4} className="admin-table-empty">Keine Standard-Anhänge hochgeladen.</td></tr>
                ) : attFiltered.length === 0 ? (
                  <tr><td colSpan={4} className="admin-table-empty">Keine Treffer.</td></tr>
                ) : attFiltered.map(a => (
                  <tr key={a.id}>
                    <td>
                      {/* Download läuft über den Browser (Cookie-Auth), nicht über apiFetch */}
                      <a
                        href={apiUrl(`/pwa/admin/quote-attachment-templates/${a.id}/download`)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <strong>{a.filename}</strong>
                      </a>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{fmtBytes(a.file_size)}</td>
                    <td style={{ color: 'var(--muted)' }}>{fmtDate(a.created_at)}</td>
                    <td>
                      <button
                        className="admin-btn admin-btn-danger admin-btn-sm"
                        onClick={() => handleAttachmentDelete(a)}
                        disabled={attDeleting === a.id}
                      >
                        {attDeleting === a.id ? '…' : 'Löschen'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <TenantTextSetting
            title="Standard-Bemerkungen"
            subtitle="Vorausgefüllter Bemerkungstext im Offerte-Formular — gibt dem Kunden mehr Flexibilität."
            state={stdNotes}
            editor="rich"
            rows={10}
            placeholder="Standard-Bemerkungstext für neue Offerten…"
            saveLabel="Bemerkungen speichern"
            hint="Zeilenumbrüche bleiben erhalten und erscheinen so auch im Offerten-PDF."
          />

          <TenantTextSetting
            title={`Schlusstext / Disclaimer${richtoffAvailable ? ' — Offerte' : ''}`}
            subtitle={richtoffAvailable
              ? 'Erscheint zuunterst auf Offerten vom Typ „Offerte", unter den Bemerkungen.'
              : 'Erscheint zuunterst auf jedem Offerten-PDF, unter den Bemerkungen.'}
            state={disc}
            editor="rich"
            rows={4}
            placeholder="Schlusstext / Disclaimer fürs Offerten-PDF…"
            saveLabel="Disclaimer speichern"
            hint="Zeilenumbrüche bleiben erhalten und erscheinen so auch im Offerten-PDF."
            emptyStateHint="Aktuell ist kein Schlusstext gesetzt — das PDF zeigt unten keinen Disclaimer."
          />

          {/* Zweiter Disclaimer für den Typ "Richtofferte" — nur sichtbar/pflegbar bei
              aktivem Feature "richtofferte". Eigenes Tenant-Feld + eigener System-Default. */}
          {richtoffAvailable && (
            <TenantTextSetting
              title="Schlusstext / Disclaimer — Richtofferte"
              subtitle={'Erscheint nur auf Offerten vom Typ „Richtofferte", unter den Bemerkungen.'}
              state={discR}
              editor="rich"
              rows={4}
              placeholder="Schlusstext / Disclaimer für Richtofferten…"
              saveLabel="Disclaimer speichern"
              hint="Zeilenumbrüche bleiben erhalten und erscheinen so auch im Offerten-PDF."
              emptyStateHint="Aktuell ist kein Schlusstext gesetzt — das PDF zeigt unten keinen Disclaimer."
            />
          )}

          <TenantTextSetting
            title="Skonto-Begleittext"
            subtitle={
              <>
                Erscheint auf der Offerte unter dem Total, sobald bei einer Offerte ein Skonto-%
                gesetzt ist. Platzhalter <code>{'{prozent}'}</code>, <code>{'{tage}'}</code> und{' '}
                <code>{'{betrag}'}</code> werden beim PDF aus den Offert-Werten gefüllt
                (<code>{'{betrag}'}</code> = Brutto-Skonto-Betrag).
              </>
            }
            state={skontoText}
            editor="textarea"
            rows={3}
            placeholder="Bei Zahlung innerhalb von {tage} Tagen {prozent}% Skonto."
            saveLabel="Begleittext speichern"
            hint="Leer lassen setzt auf den System-Standardtext zurück."
          />

          {/* ── Skonto-Vorgabe (Vorbelegung im Erstell-Formular) ── */}
          <div className="admin-page-header" style={{ marginTop: 24 }}>
            <div>
              <div className="admin-page-title" style={{ fontSize: 18 }}>Skonto-Vorgabe</div>
              <div className="admin-page-subtitle">
                Startwerte für die Skonto-Felder einer neuen Offerte — üblich ist ein fester
                Satz pro Firma («2% innert 10 Tagen»). Pro Offerte bleiben beide Werte frei
                änderbar; bestehende Offerten ändert die Vorgabe nicht.
                {!skontoDefSaved.pct && ' Aktuell keine Vorgabe — die Felder starten leer.'}
              </div>
            </div>
          </div>
          <div className="admin-table-wrap" style={{ padding: 16 }}>
            {error && <div className="admin-form-error" style={{ marginBottom: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label className="admin-form-label">Skonto (%)</label>
                <input
                  className="admin-form-input"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={skontoDefPct}
                  onChange={e => setSkontoDefPct(e.target.value)}
                  placeholder="z.B. 2"
                />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label className="admin-form-label">Frist (Tage)</label>
                <input
                  className="admin-form-input"
                  type="number"
                  step="1"
                  min="0"
                  value={skontoDefDays}
                  onChange={e => setSkontoDefDays(e.target.value)}
                  placeholder="z.B. 10"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => saveQuoteSkontoDefaults(false)}
                disabled={savingSkontoDef || (skontoDefPct === skontoDefSaved.pct && skontoDefDays === skontoDefSaved.days)}
              >
                {savingSkontoDef ? 'Speichern…' : 'Vorgabe speichern'}
              </button>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => saveQuoteSkontoDefaults(true)}
                disabled={savingSkontoDef || (!skontoDefSaved.pct && !skontoDefSaved.days)}
              >
                Vorgabe entfernen
              </button>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                Ohne Prozentsatz gibt es keine Vorgabe — die Frist allein bewirkt nichts.
              </span>
            </div>
          </div>

          {/* Danke-/Absage-Text: immer pflegbar (kein Feature-Flag am Editor, damit man
              die Texte vor dem Aktivieren der Mail-Features vorbereiten kann). */}
          <TenantTextSetting
            title="Danke-Text (Offerten-Annahme)"
            subtitle={
              <>
                Inhalt der Dankesmail, die dem Kunden nach Annahme einer Offerte zugeht —
                sobald das Feature „Danke-Mail bei Offerten-Annahme" aktiv ist (unter
                Konfiguration). Platzhalter <code>{'{kunde}'}</code>, <code>{'{offerte}'}</code>{' '}
                und <code>{'{projekt}'}</code> werden beim Versand aus der Offerte gefüllt.
                Anrede und Grussformel gehören in den Text.
              </>
            }
            state={thankyou}
            editor="textarea"
            rows={8}
            placeholder={'Guten Tag {kunde}\n\nVielen Dank für die Annahme unserer Offerte {offerte}…'}
            saveLabel="Danke-Text speichern"
            hint="Zeilenumbrüche bleiben erhalten. Leer lassen setzt auf den System-Standardtext zurück."
          />

          <TenantTextSetting
            title="Absage-Text (Offerten-Ablehnung)"
            subtitle={
              <>
                Inhalt der Mail, die dem Kunden nach der Ablehnung einer Offerte zugeht —
                sobald das Feature „Absage-Mail bei Offerten-Ablehnung" aktiv ist (unter
                Konfiguration). Platzhalter <code>{'{kunde}'}</code>, <code>{'{offerte}'}</code>{' '}
                und <code>{'{projekt}'}</code> werden beim Versand aus der Offerte gefüllt.
                Anrede und Grussformel gehören in den Text.
              </>
            }
            state={rejection}
            editor="textarea"
            rows={8}
            placeholder={'Guten Tag {kunde}\n\nBesten Dank für Ihre Rückmeldung zu unserer Offerte {offerte}…'}
            saveLabel="Absage-Text speichern"
            hint="Zeilenumbrüche bleiben erhalten. Leer lassen setzt auf den System-Standardtext zurück."
          />
        </>
      )}

      {/* Edit/New Modal */}
      {editing !== null && (
        <div
          className="admin-modal-overlay"
          {...backdropCloseProps(closeEditor, {
            blockWhen: () => formIsDirty,
            onBlocked: () => setConfirmDiscard(true),
          })}
        >
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                {editing.id === 'new'
                  ? (isSpecialModal ? 'Neue Sonderposition' : 'Neue Montage-Vorlage')
                  : 'Vorlage bearbeiten'}
              </div>
              <button className="admin-modal-close" onClick={closeEditor}>×</button>
            </div>
            <form onSubmit={handleSave} className="admin-modal-body">
              {error && <div className="admin-form-error">{error}</div>}
              <div className="admin-form-group">
                <label className="admin-form-label">Bezeichnung *</label>
                <input
                  className="admin-form-input"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder={isSpecialModal ? 'z.B. Demontage Komplettanlage' : 'z.B. Montage Standard'}
                  required
                  autoFocus
                />
              </div>

              {isSpecialModal && (
                <div className="admin-form-group">
                  <label className="admin-form-label">Preismodell</label>
                  <select
                    className="admin-form-input"
                    value={form.pricing_mode}
                    onChange={e => setForm(f => ({ ...f, pricing_mode: e.target.value as SpecialMode }))}
                  >
                    <option value="pauschal">Pauschale (Fixbetrag)</option>
                    <option value="stunden">Stundenansatz (CHF/h)</option>
                  </select>
                </div>
              )}

              <div className="admin-form-group">
                <label className="admin-form-label">
                  {isSpecialModal && form.pricing_mode === 'stunden' ? 'Stundenansatz CHF/h *' : 'Betrag CHF *'}
                </label>
                <input
                  className="admin-form-input"
                  type="number"
                  step="0.05"
                  min="0"
                  value={form.default_fee}
                  onChange={e => setForm(f => ({ ...f, default_fee: e.target.value }))}
                  required
                  placeholder="z.B. 150"
                />
              </div>

              {isSpecialModal && form.pricing_mode === 'stunden' && (
                <div className="admin-form-group">
                  <label className="admin-form-label">Vorgeschlagene Stunden *</label>
                  <input
                    className="admin-form-input"
                    type="number"
                    step="0.5"
                    min="0"
                    value={form.default_hours}
                    onChange={e => setForm(f => ({ ...f, default_hours: e.target.value }))}
                    required
                    placeholder="z.B. 2"
                  />
                </div>
              )}

              <div className="admin-form-group">
                <label className="admin-form-label">Notiz (optional)</label>
                <input
                  className="admin-form-input"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Interne Notiz / Hinweis"
                />
              </div>
            </form>
            <div className="admin-modal-footer">
              {editing.id !== 'new' && (
                <button className="admin-btn admin-btn-danger" onClick={handleDelete} disabled={saving} style={{ marginRight: 'auto' }}>
                  Löschen
                </button>
              )}
              <button className="admin-btn admin-btn-secondary" onClick={closeEditor}>Abbrechen</button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={e => { (e.currentTarget.closest('div.admin-modal')?.querySelector('form') as HTMLFormElement)?.requestSubmit() }}
                disabled={saving}
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Klick neben das Fenster bei angefangener Vorlage: nachfragen statt wegwerfen. */}
      {confirmDiscard && (
        <ConfirmDialog
          title="Eingaben verwerfen?"
          message="Die Vorlage ist noch nicht gespeichert. Schliessen verwirft die Eingaben."
          confirmLabel="Verwerfen"
          cancelLabel="Weiter bearbeiten"
          variant="danger"
          onConfirm={closeEditor}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}

      <ToastHost toast={toast} />
    </>
  )
}

// Rechnungs-Vorlagen: Zahlungskondition (immer), Skonto-Warnhinweis (nur bei Abrechnung
// einer Offerte mit Skonto) und Schlusssatz. Je ein eigenes Tenant-Feld + System-Default.
function RechnungsVorlagenPanel() {
  const { toast, showToast } = useToast()

  // Zahlungskondition ("Zahlbar innert 30 Tagen netto."). Steht auf JEDER Rechnung.
  // 3 Zustände wie beim Schlusssatz; {tage} wird serverseitig beim Rendern durch die
  // konfigurierte Frist ersetzt (die Response nennt sie im Zusatzfeld `days`).
  const payment = useTenantText('/pwa/admin/invoice-payment-terms', 'text', {
    showToast, savedMsg: 'Zahlungskondition gespeichert',
  })
  const skontoWarn = useTenantText('/pwa/admin/invoice-skonto-warning', 'text', {
    showToast, savedMsg: 'Skonto-Warnhinweis gespeichert',
  })
  const footer = useTenantText('/pwa/admin/invoice-footer-text', 'text', {
    showToast, savedMsg: 'Schlusssatz gespeichert',
  })
  const loading = [payment, skontoWarn, footer].some(s => s.loading)
  const paymentDays = typeof payment.meta.days === 'number' ? payment.meta.days : 30

  return (
    <>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Rechnungs-Vorlagen</div>
          <div className="admin-page-subtitle">Texte, die auf der Rechnung erscheinen</div>
        </div>
      </div>

      {loading ? (
        <div className="admin-table-wrap"><div className="admin-loading"><div className="admin-spinner" /> Laden…</div></div>
      ) : (
        <>
          <TenantTextSetting
            first
            title="Zahlungskondition"
            subtitle={
              <>
                Erscheint auf jeder Rechnung unter dem Total — unabhängig vom Skonto.
                Der Platzhalter <code>{'{tage}'}</code> wird durch die Zahlungsfrist ersetzt
                ({paymentDays} Tage); nach dieser Frist laufen auch Zahlungserinnerung und Mahnung.
              </>
            }
            state={payment}
            editor="textarea"
            rows={2}
            placeholder="Zahlbar innert {tage} Tagen netto."
            saveLabel="Zahlungskondition speichern"
            hint={'Feld leeren und speichern entfernt die Zahlungskondition ganz; „zurücksetzen" stellt den Standardtext wieder her.'}
            emptyStateHint="Aktuell ist keine Zahlungskondition gesetzt — die Rechnung nennt dem Kunden keine Frist."
          />

          <TenantTextSetting
            title="Skonto-Warnhinweis (Rechnung)"
            subtitle={
              <>
                Erscheint auf der Rechnung unter dem Total, sobald eine Offerte mit Skonto
                abgerechnet wird — zusammen mit der wiederholten Skonto-Kondition. Standardsatz,
                falls ein Kunde Skonto abzieht, ohne rechtzeitig zu zahlen.
              </>
            }
            state={skontoWarn}
            editor="textarea"
            rows={2}
            placeholder="Ungerechtfertigte Skontoabzüge werden nachbelastet."
            saveLabel="Warnhinweis speichern"
            hint="Leer lassen setzt auf den System-Standardtext zurück."
          />

          <TenantTextSetting
            title="Schlusssatz (Dankestext)"
            subtitle={
              <>
                Erscheint zuunterst auf der Rechnung, direkt vor dem QR-Zahlteil — z.B.
                „Vielen Dank für Ihr Vertrauen".
              </>
            }
            state={footer}
            editor="rich"
            rows={3}
            placeholder="Vielen Dank für Ihr Vertrauen und die angenehme Zusammenarbeit."
            saveLabel="Schlusssatz speichern"
            hint={'Feld leeren und speichern entfernt den Schlusssatz ganz; „zurücksetzen" stellt den Standardtext wieder her.'}
            emptyStateHint="Aktuell ist kein Schlusssatz gesetzt — die Rechnung zeigt vor dem QR-Teil keinen Text."
          />
        </>
      )}

      <ToastHost toast={toast} />
    </>
  )
}

type VorlagenTab = 'offerte' | 'rechnung'

// "Vorlagen" bündelt die Offert- und Rechnungs-Vorlagen unter einem Tab-Layout
// analog zum Material-Screen.
export default function QuoteTemplatesScreen() {
  const [tab, setTab] = useState<VorlagenTab>('offerte')

  return (
    <div className="admin-page">
      {/* kpi-admin-tabs-sticky: die Reiter bleiben beim Scrollen oben sichtbar
          (der Screen wird durch die vielen Vorlagen-Abschnitte lang). */}
      <div className="kpi-admin-tabs kpi-admin-tabs-sticky" style={{ marginBottom: 20 }}>
        <button
          className={`kpi-admin-tab${tab === 'offerte' ? ' active' : ''}`}
          onClick={() => setTab('offerte')}
        >
          Offerte
        </button>
        <button
          className={`kpi-admin-tab${tab === 'rechnung' ? ' active' : ''}`}
          onClick={() => setTab('rechnung')}
        >
          Rechnung
        </button>
      </div>

      {tab === 'offerte' && <OffertenVorlagenPanel />}
      {tab === 'rechnung' && <RechnungsVorlagenPanel />}
    </div>
  )
}
