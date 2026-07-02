import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { getMe } from '../../api/auth'
import { isFeatureEnabled } from '../../api/modules'

// Vorlagen für die Offerten-Sektionen "Montagepositionen" und "Sonderpositionen".
// Spiegelt die Schnell-Buttons im Offerte-Formular — hier zentral pflegbar, ohne Migration.

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

export default function QuoteTemplatesScreen() {
  const [installation, setInstallation] = useState<InstallationTpl[]>([])
  const [special, setSpecial] = useState<SpecialTpl[]>([])
  const [specialFeatureOn, setSpecialFeatureOn] = useState(true)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  // Standard-Bemerkungen: aktueller Editor-Wert, zuletzt gespeicherter Wert (für Dirty-Check),
  // und ob aktuell der System-Default greift (Mandant hat noch keinen eigenen Text).
  const [stdNotes, setStdNotes] = useState('')
  const [stdNotesSaved, setStdNotesSaved] = useState('')
  const [stdIsDefault, setStdIsDefault] = useState(true)
  const [savingNotes, setSavingNotes] = useState(false)
  // Footer-Disclaimer: analog zu den Standard-Bemerkungen, eigenes Tenant-Feld.
  const [stdDisc, setStdDisc] = useState('')
  const [stdDiscSaved, setStdDiscSaved] = useState('')
  const [stdDiscIsDefault, setStdDiscIsDefault] = useState(true)
  const [savingDisc, setSavingDisc] = useState(false)
  // Zweiter Disclaimer für den Typ "Richtofferte" — nur sichtbar/pflegbar bei aktivem
  // Feature "richtofferte". Eigenes Tenant-Feld + eigener System-Default.
  const [richtoffAvailable, setRichtoffAvailable] = useState(false)
  const [stdDiscR, setStdDiscR] = useState('')
  const [stdDiscRSaved, setStdDiscRSaved] = useState('')
  const [stdDiscRIsDefault, setStdDiscRIsDefault] = useState(true)
  const [savingDiscR, setSavingDiscR] = useState(false)
  // Skonto-Begleittext (Hinweis "Abzug bei früher Zahlung" auf der Offerte). Eigenes
  // Tenant-Feld + System-Default; immer pflegbar (kein Feature-Flag).
  const [skontoTxt, setSkontoTxt] = useState('')
  const [skontoTxtSaved, setSkontoTxtSaved] = useState('')
  const [skontoIsDefault, setSkontoIsDefault] = useState(true)
  const [savingSkonto, setSavingSkonto] = useState(false)
  // Skonto-Warnhinweis auf der Rechnung ("Ungerechtfertigte Skontoabzüge werden
  // nachbelastet"). Erscheint bei Abrechnung einer Offerte mit Skonto. Eigenes Tenant-Feld.
  const [skontoWarn, setSkontoWarn] = useState('')
  const [skontoWarnSaved, setSkontoWarnSaved] = useState('')
  const [skontoWarnIsDefault, setSkontoWarnIsDefault] = useState(true)
  const [savingSkontoWarn, setSavingSkontoWarn] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [data, notes, disc, discR, skonto, skontoW] = await Promise.all([
        apiFetch('/pwa/admin/quote-position-templates') as Promise<{ installation: InstallationTpl[]; special: SpecialTpl[] }>,
        apiFetch('/pwa/admin/quote-standard-notes') as Promise<{ notes: string; is_default: boolean }>,
        apiFetch('/pwa/admin/quote-footer-disclaimer') as Promise<{ disclaimer: string; is_default: boolean }>,
        apiFetch('/pwa/admin/quote-footer-disclaimer-richtofferte') as Promise<{ disclaimer: string; is_default: boolean }>,
        apiFetch('/pwa/admin/quote-skonto-text') as Promise<{ text: string; is_default: boolean }>,
        apiFetch('/pwa/admin/invoice-skonto-warning') as Promise<{ text: string; is_default: boolean }>,
      ])
      setInstallation(data.installation ?? [])
      setSpecial(data.special ?? [])
      setStdNotes(notes.notes ?? '')
      setStdNotesSaved(notes.notes ?? '')
      setStdIsDefault(notes.is_default)
      setStdDisc(disc.disclaimer ?? '')
      setStdDiscSaved(disc.disclaimer ?? '')
      setStdDiscIsDefault(disc.is_default)
      setStdDiscR(discR.disclaimer ?? '')
      setStdDiscRSaved(discR.disclaimer ?? '')
      setStdDiscRIsDefault(discR.is_default)
      setSkontoTxt(skonto.text ?? '')
      setSkontoTxtSaved(skonto.text ?? '')
      setSkontoIsDefault(skonto.is_default)
      setSkontoWarn(skontoW.text ?? '')
      setSkontoWarnSaved(skontoW.text ?? '')
      setSkontoWarnIsDefault(skontoW.is_default)
    } finally {
      setLoading(false)
    }
  }

  async function saveStandardNotes(reset = false) {
    setSavingNotes(true)
    setError('')
    try {
      const res = await apiFetch('/pwa/admin/quote-standard-notes', {
        method: 'PATCH',
        body: JSON.stringify({ notes: reset ? '' : stdNotes }),
      }) as { notes: string; is_default: boolean }
      setStdNotes(res.notes ?? '')
      setStdNotesSaved(res.notes ?? '')
      setStdIsDefault(res.is_default)
      showToast(reset ? 'Auf Standardtext zurückgesetzt' : 'Standard-Bemerkungen gespeichert')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSavingNotes(false)
    }
  }

  async function saveFooterDisclaimer(reset = false) {
    setSavingDisc(true)
    setError('')
    try {
      // reset => null (Reset auf System-Default); sonst der Editor-Wert. Leerer
      // String ist erlaubt und heisst "bewusst kein Disclaimer" (wird gespeichert).
      const res = await apiFetch('/pwa/admin/quote-footer-disclaimer', {
        method: 'PATCH',
        body: JSON.stringify({ disclaimer: reset ? null : stdDisc }),
      }) as { disclaimer: string; is_default: boolean }
      setStdDisc(res.disclaimer ?? '')
      setStdDiscSaved(res.disclaimer ?? '')
      setStdDiscIsDefault(res.is_default)
      showToast(reset ? 'Auf Standardtext zurückgesetzt' : 'Disclaimer gespeichert')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSavingDisc(false)
    }
  }

  async function saveFooterDisclaimerRichtofferte(reset = false) {
    setSavingDiscR(true)
    setError('')
    try {
      const res = await apiFetch('/pwa/admin/quote-footer-disclaimer-richtofferte', {
        method: 'PATCH',
        body: JSON.stringify({ disclaimer: reset ? null : stdDiscR }),
      }) as { disclaimer: string; is_default: boolean }
      setStdDiscR(res.disclaimer ?? '')
      setStdDiscRSaved(res.disclaimer ?? '')
      setStdDiscRIsDefault(res.is_default)
      showToast(reset ? 'Auf Standardtext zurückgesetzt' : 'Disclaimer (Richtofferte) gespeichert')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSavingDiscR(false)
    }
  }

  async function saveQuoteSkontoText(reset = false) {
    setSavingSkonto(true)
    setError('')
    try {
      // reset => null (Reset auf System-Default); sonst der Editor-Wert (leer wird
      // serverseitig ebenfalls als Reset behandelt — leerer Begleittext ergibt keinen Sinn).
      const res = await apiFetch('/pwa/admin/quote-skonto-text', {
        method: 'PATCH',
        body: JSON.stringify({ text: reset ? null : skontoTxt }),
      }) as { text: string; is_default: boolean }
      setSkontoTxt(res.text ?? '')
      setSkontoTxtSaved(res.text ?? '')
      setSkontoIsDefault(res.is_default)
      showToast(reset ? 'Auf Standardtext zurückgesetzt' : 'Skonto-Begleittext gespeichert')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSavingSkonto(false)
    }
  }

  async function saveInvoiceSkontoWarning(reset = false) {
    setSavingSkontoWarn(true)
    setError('')
    try {
      // reset => null (Reset auf System-Default); sonst der Editor-Wert (leer wird
      // serverseitig ebenfalls als Reset behandelt).
      const res = await apiFetch('/pwa/admin/invoice-skonto-warning', {
        method: 'PATCH',
        body: JSON.stringify({ text: reset ? null : skontoWarn }),
      }) as { text: string; is_default: boolean }
      setSkontoWarn(res.text ?? '')
      setSkontoWarnSaved(res.text ?? '')
      setSkontoWarnIsDefault(res.is_default)
      showToast(reset ? 'Auf Standardtext zurückgesetzt' : 'Skonto-Warnhinweis gespeichert')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSavingSkontoWarn(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    getMe().then(me => {
      setSpecialFeatureOn(isFeatureEnabled(me, 'sonderpositionen'))
      setRichtoffAvailable(isFeatureEnabled(me, 'richtofferte'))
    }).catch(() => {})
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function openNew(kind: Kind) {
    setForm(EMPTY_FORM)
    setEditing({ kind, id: 'new' })
    setError('')
  }

  function openEditInstallation(t: InstallationTpl) {
    setForm({ ...EMPTY_FORM, label: t.label, default_fee: String(t.default_fee), notes: t.notes ?? '' })
    setEditing({ kind: 'installation', id: t.id })
    setError('')
  }

  function openEditSpecial(t: SpecialTpl) {
    setForm({
      label: t.label,
      default_fee: String(t.default_fee),
      pricing_mode: t.pricing_mode,
      default_hours: t.default_hours != null ? String(t.default_hours) : '',
      notes: t.notes ?? '',
    })
    setEditing({ kind: 'special', id: t.id })
    setError('')
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
      setEditing(null)
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
      setEditing(null)
      showToast('Vorlage gelöscht')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  const isSpecialModal = editing?.kind === 'special'

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Offert-Vorlagen</div>
          <div className="admin-page-subtitle">Schnell-Buttons für Montage- und Sonderpositionen im Offerte-Formular</div>
        </div>
      </div>

      {loading ? (
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
                    <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>CHF {t.default_fee.toFixed(2)}</td>
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
                    <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>
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

          {/* ── Standard-Bemerkungen ── */}
          <div className="admin-page-header" style={{ marginTop: 24 }}>
            <div>
              <div className="admin-page-title" style={{ fontSize: 18 }}>Standard-Bemerkungen</div>
              <div className="admin-page-subtitle">
                Vorausgefüllter Bemerkungstext im Offerte-Formular — gibt dem Kunden mehr Flexibilität.
                {stdIsDefault && ' Aktuell wird der System-Standardtext verwendet.'}
              </div>
            </div>
          </div>
          <div className="admin-table-wrap" style={{ padding: 16 }}>
            <textarea
              className="admin-form-input"
              rows={10}
              value={stdNotes}
              onChange={e => setStdNotes(e.target.value)}
              placeholder="Standard-Bemerkungstext für neue Offerten…"
              style={{ resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => saveStandardNotes(false)}
                disabled={savingNotes || stdNotes === stdNotesSaved}
              >
                {savingNotes ? 'Speichern…' : 'Bemerkungen speichern'}
              </button>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => saveStandardNotes(true)}
                disabled={savingNotes || stdIsDefault}
              >
                Auf Standardtext zurücksetzen
              </button>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                Zeilenumbrüche bleiben erhalten und erscheinen so auch im Offerten-PDF.
              </span>
            </div>
          </div>

          {/* ── Footer-Disclaimer ── */}
          <div className="admin-page-header" style={{ marginTop: 24 }}>
            <div>
              <div className="admin-page-title" style={{ fontSize: 18 }}>Schlusstext / Disclaimer{richtoffAvailable ? ' — Offerte' : ''}</div>
              <div className="admin-page-subtitle">
                {richtoffAvailable
                  ? 'Erscheint zuunterst auf Offerten vom Typ „Offerte", unter den Bemerkungen.'
                  : 'Erscheint zuunterst auf jedem Offerten-PDF, unter den Bemerkungen.'}
                {stdDiscIsDefault && ' Aktuell wird der System-Standardtext verwendet.'}
                {!stdDiscIsDefault && stdDiscSaved.trim() === '' &&
                  ' Aktuell ist kein Schlusstext gesetzt — das PDF zeigt unten keinen Disclaimer.'}
              </div>
            </div>
          </div>
          <div className="admin-table-wrap" style={{ padding: 16 }}>
            <textarea
              className="admin-form-input"
              rows={4}
              value={stdDisc}
              onChange={e => setStdDisc(e.target.value)}
              placeholder="Schlusstext / Disclaimer fürs Offerten-PDF…"
              style={{ resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => saveFooterDisclaimer(false)}
                disabled={savingDisc || stdDisc === stdDiscSaved}
              >
                {savingDisc ? 'Speichern…' : 'Disclaimer speichern'}
              </button>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => saveFooterDisclaimer(true)}
                disabled={savingDisc || stdDiscIsDefault}
              >
                Auf Standardtext zurücksetzen
              </button>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                Zeilenumbrüche bleiben erhalten und erscheinen so auch im Offerten-PDF.
              </span>
            </div>
          </div>

          {/* ── Footer-Disclaimer Richtofferte (nur bei aktivem Feature "richtofferte") ── */}
          {richtoffAvailable && (
            <>
              <div className="admin-page-header" style={{ marginTop: 24 }}>
                <div>
                  <div className="admin-page-title" style={{ fontSize: 18 }}>Schlusstext / Disclaimer — Richtofferte</div>
                  <div className="admin-page-subtitle">
                    Erscheint nur auf Offerten vom Typ „Richtofferte", unter den Bemerkungen.
                    {stdDiscRIsDefault && ' Aktuell wird der System-Standardtext verwendet.'}
                    {!stdDiscRIsDefault && stdDiscRSaved.trim() === '' &&
                      ' Aktuell ist kein Schlusstext gesetzt — das PDF zeigt unten keinen Disclaimer.'}
                  </div>
                </div>
              </div>
              <div className="admin-table-wrap" style={{ padding: 16 }}>
                <textarea
                  className="admin-form-input"
                  rows={4}
                  value={stdDiscR}
                  onChange={e => setStdDiscR(e.target.value)}
                  placeholder="Schlusstext / Disclaimer für Richtofferten…"
                  style={{ resize: 'vertical', lineHeight: 1.5 }}
                />
                <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    className="admin-btn admin-btn-primary"
                    onClick={() => saveFooterDisclaimerRichtofferte(false)}
                    disabled={savingDiscR || stdDiscR === stdDiscRSaved}
                  >
                    {savingDiscR ? 'Speichern…' : 'Disclaimer speichern'}
                  </button>
                  <button
                    className="admin-btn admin-btn-secondary"
                    onClick={() => saveFooterDisclaimerRichtofferte(true)}
                    disabled={savingDiscR || stdDiscRIsDefault}
                  >
                    Auf Standardtext zurücksetzen
                  </button>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                    Zeilenumbrüche bleiben erhalten und erscheinen so auch im Offerten-PDF.
                  </span>
                </div>
              </div>
            </>
          )}

          {/* ── Skonto-Begleittext (Hinweis "Abzug bei früher Zahlung"; für alle Mandanten) ── */}
          <div className="admin-page-header" style={{ marginTop: 24 }}>
            <div>
              <div className="admin-page-title" style={{ fontSize: 18 }}>Skonto-Begleittext</div>
              <div className="admin-page-subtitle">
                Erscheint auf der Offerte unter dem Total, sobald bei einer Offerte ein Skonto-%
                gesetzt ist. Platzhalter <code>{'{prozent}'}</code>, <code>{'{tage}'}</code> und{' '}
                <code>{'{betrag}'}</code> werden beim PDF aus den Offert-Werten gefüllt
                (<code>{'{betrag}'}</code> = Brutto-Skonto-Betrag).
                {skontoIsDefault && ' Aktuell wird der System-Standardtext verwendet.'}
              </div>
            </div>
          </div>
          <div className="admin-table-wrap" style={{ padding: 16 }}>
            <textarea
              className="admin-form-input"
              rows={3}
              value={skontoTxt}
              onChange={e => setSkontoTxt(e.target.value)}
              placeholder="Bei Zahlung innerhalb von {tage} Tagen {prozent}% Skonto."
              style={{ resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => saveQuoteSkontoText(false)}
                disabled={savingSkonto || skontoTxt === skontoTxtSaved}
              >
                {savingSkonto ? 'Speichern…' : 'Begleittext speichern'}
              </button>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => saveQuoteSkontoText(true)}
                disabled={savingSkonto || skontoIsDefault}
              >
                Auf Standardtext zurücksetzen
              </button>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                Leer lassen setzt auf den System-Standardtext zurück.
              </span>
            </div>
          </div>

          {/* ── Skonto-Warnhinweis auf der Rechnung (für alle Mandanten) ── */}
          <div className="admin-page-header" style={{ marginTop: 24 }}>
            <div>
              <div className="admin-page-title" style={{ fontSize: 18 }}>Skonto-Warnhinweis (Rechnung)</div>
              <div className="admin-page-subtitle">
                Erscheint auf der Rechnung unter dem Total, sobald eine Offerte mit Skonto
                abgerechnet wird — zusammen mit der wiederholten Skonto-Kondition. Standardsatz,
                falls ein Kunde Skonto abzieht, ohne rechtzeitig zu zahlen.
                {skontoWarnIsDefault && ' Aktuell wird der System-Standardtext verwendet.'}
              </div>
            </div>
          </div>
          <div className="admin-table-wrap" style={{ padding: 16 }}>
            <textarea
              className="admin-form-input"
              rows={2}
              value={skontoWarn}
              onChange={e => setSkontoWarn(e.target.value)}
              placeholder="Ungerechtfertigte Skontoabzüge werden nachbelastet."
              style={{ resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => saveInvoiceSkontoWarning(false)}
                disabled={savingSkontoWarn || skontoWarn === skontoWarnSaved}
              >
                {savingSkontoWarn ? 'Speichern…' : 'Warnhinweis speichern'}
              </button>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => saveInvoiceSkontoWarning(true)}
                disabled={savingSkontoWarn || skontoWarnIsDefault}
              >
                Auf Standardtext zurücksetzen
              </button>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                Leer lassen setzt auf den System-Standardtext zurück.
              </span>
            </div>
          </div>
        </>
      )}

      {/* Edit/New Modal */}
      {editing !== null && (
        <div className="admin-modal-overlay" onClick={() => setEditing(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                {editing.id === 'new'
                  ? (isSpecialModal ? 'Neue Sonderposition' : 'Neue Montage-Vorlage')
                  : 'Vorlage bearbeiten'}
              </div>
              <button className="admin-modal-close" onClick={() => setEditing(null)}>×</button>
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
              <button className="admin-btn admin-btn-secondary" onClick={() => setEditing(null)}>Abbrechen</button>
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

      {toast && (
        <div className="admin-toast-container">
          <div className="admin-toast success">{toast}</div>
        </div>
      )}
    </div>
  )
}
